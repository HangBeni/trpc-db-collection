// src/collection-options.ts
import { Store } from "@tanstack/store";

// src/logger.ts
var Logger = class {
  constructor(config = {}, name) {
    this.colors = {
      debug: "\x1B[34m",
      // Blue
      info: "\x1B[32m",
      // Green
      error: "\x1B[31m"
      // Red
    };
    this.config = { enabled: true, level: "info", ...config };
    this.name = name;
    this.prefix = `[tRPC DB] [${this.name}]`;
  }
  debug(...args) {
    if (this.config.enabled && (this.config.level === "debug" || this.config.level === "info")) {
      const color = this.colors.debug;
      console.debug(`${color}${this.prefix}`, ...args);
    }
  }
  info(...args) {
    if (this.config.enabled && this.config.level === "info") {
      const color = this.colors.info;
      console.info(`${color}${this.prefix}`, ...args);
    }
  }
  error(...args) {
    if (this.config.enabled && this.config.level !== "none") {
      const color = this.colors.error;
      console.error(`${color}${this.prefix}`, ...args);
    }
  }
};

// src/local-storage.ts
var jsonSerializer = {
  parse: (text) => JSON.parse(text),
  stringify: (value) => JSON.stringify(value)
};
function getLocalStorageKey(collectionName) {
  return `trpc-db-collection-${collectionName}`;
}
function loadFromLocalStorage(collectionName, serializer) {
  try {
    const key = getLocalStorageKey(collectionName);
    const data = localStorage.getItem(key);
    return data ? serializer.parse(data) : null;
  } catch (error) {
    console.error(
      `Failed to load from local storage for ${collectionName}:`,
      error
    );
    return null;
  }
}
function saveToLocalStorage(collectionName, data, serializer) {
  try {
    const key = getLocalStorageKey(collectionName);
    localStorage.setItem(key, serializer.stringify(data));
  } catch (error) {
    console.error(
      `Failed to save to local storage for ${collectionName}:`,
      error
    );
  }
}
function updateLocalStorageAfterWrite(operation, item, config) {
  if (config.localStorageSyncEnabled === false) {
    return;
  }
  try {
    const currentData = loadFromLocalStorage(config.name, config.serializer) || [];
    let updatedData;
    switch (operation) {
      case "insert":
        updatedData = [...currentData, item];
        break;
      case "update":
        updatedData = currentData.map(
          (existingItem) => existingItem.id === item.id ? { ...existingItem, ...item } : existingItem
        );
        break;
      case "delete":
        updatedData = currentData.filter(
          (existingItem) => existingItem.id !== item.id
        );
        break;
    }
    saveToLocalStorage(config.name, updatedData, config.serializer);
    config.logger.info(`Updated local storage after ${operation}`, item);
  } catch (error) {
    config.logger.error(
      `Failed to update local storage after ${operation}:`,
      error
    );
  }
}

// src/collection-options.ts
function trpcCollectionOptions(config) {
  const logger = new Logger(config.loggerConfig, config.name);
  const serializer = config.serializer ?? jsonSerializer;
  const localStorageSyncEnabled = config.localStorage ?? true;
  const receivedEventIds = new Store(/* @__PURE__ */ new Set());
  const sync = (params) => {
    const { begin, write, commit, markReady } = params;
    let lastEventId = null;
    const eventBuffer = [];
    let isInitialSyncComplete = false;
    const subscription = config.trpcRouter.listen.subscribe(
      { lastEventId },
      {
        onData: (event) => {
          logger.info("Received sync event", event);
          if (Array.isArray(event)) {
            event = { id: event[0], data: event[1] };
          }
          const { data } = event;
          if (!isInitialSyncComplete) {
            eventBuffer.push(data);
            return;
          }
          begin();
          write({ type: data.action, value: data.data });
          commit();
          if (localStorageSyncEnabled) {
            updateLocalStorageAfterWrite(data.action, data.data, {
              name: config.name,
              logger,
              localStorageSyncEnabled,
              serializer
            });
          }
          receivedEventIds.setState((prev) => /* @__PURE__ */ new Set([...prev, data.id]));
          lastEventId = data.id;
          config.onEvent?.(data);
        },
        onError: (error) => {
          logger.error("Sync error:", error);
        }
      }
    );
    async function initialSync() {
      logger.info("Starting initial sync");
      try {
        const cachedData = localStorageSyncEnabled ? loadFromLocalStorage(config.name, serializer) : null;
        begin();
        if (localStorageSyncEnabled && cachedData && cachedData.length > 0) {
          logger.info(
            "Loaded data from local storage",
            cachedData.length,
            "items"
          );
          for (const item of cachedData) {
            write({
              type: "insert",
              value: item
            });
          }
          commit();
        }
        const networkData = await config.trpcRouter.list.query();
        begin();
        for (const item of cachedData || []) {
          write({
            type: "delete",
            value: item
          });
        }
        for (const item of networkData) {
          write({
            type: "insert",
            value: item
          });
        }
        commit();
        if (localStorageSyncEnabled) {
          saveToLocalStorage(config.name, networkData, serializer);
          logger.info(
            "Saved data to local storage",
            networkData.length,
            "items"
          );
        }
        isInitialSyncComplete = true;
        if (eventBuffer.length > 0) {
          begin();
          for (const event of eventBuffer) {
            write({ type: event.action, value: event.data });
          }
          commit();
          if (localStorageSyncEnabled) {
            for (const event of eventBuffer) {
              updateLocalStorageAfterWrite(event.action, event.data, {
                name: config.name,
                logger,
                serializer,
                localStorageSyncEnabled
              });
            }
          }
          for (const event of eventBuffer) {
            receivedEventIds.setState((prev) => /* @__PURE__ */ new Set([...prev, event.id]));
            lastEventId = event.id;
            config.onEvent?.(event);
          }
          eventBuffer.splice(0);
        }
        logger.info("Initial sync complete");
      } catch (error) {
        logger.error("Initial sync failed:", error);
        throw error;
      } finally {
        markReady();
      }
    }
    initialSync();
    return () => {
      subscription.unsubscribe();
    };
  };
  const awaitEventId = (eventId) => {
    logger.debug("Waiting for event id", eventId);
    if (receivedEventIds.state.has(eventId)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const unsubscribe = receivedEventIds.subscribe(() => {
        if (receivedEventIds.state.has(eventId)) {
          unsubscribe.unsubscribe();
          resolve(true);
          logger.debug("Received event id", eventId);
        }
      });
    });
  };
  return {
    ...config,
    getKey: (item) => item.id,
    sync: {
      sync,
      rowUpdateMode: config.rowUpdateMode ?? "partial"
    },
    onInsert: async ({ transaction }) => {
      const { modified } = transaction.mutations[0];
      logger.info("Inserting item", modified);
      const result = await config.trpcRouter.create.mutate({
        ...modified
      });
      await awaitEventId(result.eventId);
      if (localStorageSyncEnabled) {
        updateLocalStorageAfterWrite("insert", result.item, {
          name: config.name,
          logger,
          serializer,
          localStorageSyncEnabled
        });
      }
      return { result };
    },
    onUpdate: async ({ transaction }) => {
      const { modified, changes } = transaction.mutations[0];
      logger.info("Updating item", modified, changes);
      const result = await config.trpcRouter.update.mutate({
        id: modified.id,
        data: changes
      });
      await awaitEventId(result.eventId);
      if (localStorageSyncEnabled) {
        updateLocalStorageAfterWrite("update", result.item, {
          name: config.name,
          logger,
          serializer,
          localStorageSyncEnabled
        });
      }
      return { result };
    },
    onDelete: async ({ transaction }) => {
      const { modified } = transaction.mutations[0];
      logger.info("Deleting item", modified);
      const result = await config.trpcRouter.delete.mutate({
        id: modified.id
      });
      await awaitEventId(result.eventId);
      if (localStorageSyncEnabled) {
        updateLocalStorageAfterWrite("delete", modified, {
          name: config.name,
          logger,
          serializer,
          localStorageSyncEnabled
        });
      }
      return { result };
    }
  };
}

// src/scoped-collection-options.ts
function scopedTrpcCollectionOptions({
  id,
  getKey,
  list,
  getOne,
  listen
}) {
  return {
    id,
    getKey,
    sync: {
      rowUpdateMode: "partial",
      sync({ collection, begin, truncate, write, commit, markReady, markError }) {
        let active = true;
        let ready = false;
        let pending = Promise.resolve();
        const enqueue = (operation) => {
          pending = pending.then(async () => {
            if (!active) return;
            try {
              await operation();
            } catch (error) {
              if (active && !ready) markError(error);
            }
          });
        };
        const refresh = async () => {
          const rows = await list();
          if (!active) return;
          begin();
          truncate();
          for (const row of rows) write({ type: "insert", value: row });
          await commit();
          if (!active) return;
          ready = true;
          markReady();
        };
        const onChange = ({ key }) => {
          if (key === void 0 || !getOne) {
            enqueue(refresh);
            return;
          }
          enqueue(async () => {
            let row;
            try {
              row = await getOne(key);
            } catch {
              await refresh();
              return;
            }
            if (!active) return;
            if (row !== null && getKey(row) !== key) {
              await refresh();
              return;
            }
            begin();
            if (row === null) {
              write({ type: "delete", key });
            } else {
              write({
                type: collection.has(key) ? "update" : "insert",
                value: row
              });
            }
            await commit();
          });
        };
        const subscription = listen(onChange);
        enqueue(refresh);
        return () => {
          active = false;
          subscription.unsubscribe();
        };
      }
    }
  };
}
export {
  scopedTrpcCollectionOptions,
  trpcCollectionOptions
};
//# sourceMappingURL=index.js.map