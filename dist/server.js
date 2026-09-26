// src/events.ts
import EventEmitter, { on } from "events";
import { tracked } from "@trpc/server";
var IterableEventEmitter = class extends EventEmitter {
  toIterable(eventName, opts) {
    return on(this, eventName, opts);
  }
};
var TrpcSync = class {
  constructor() {
    this.ee = new IterableEventEmitter();
  }
  async *eventsSubscription(opts) {
    const iterable = this.ee.toIterable("event", {
      signal: opts.signal
    });
    if (opts.lastEventId && opts.fetchLastEvents) {
      const lastEvents = await opts.fetchLastEvents(opts.lastEventId);
      for (const event of lastEvents) {
        if (event.userId === opts.userId) {
          yield tracked(event.id.toString(), event);
        }
      }
    }
    for await (const [userId, data] of iterable) {
      if (userId === opts.userId) {
        yield tracked(data.id.toString(), data);
      }
    }
  }
  async registerEvent({
    currentUserId,
    otherUserIds,
    event,
    saveEvent
  }) {
    const currentUserEvent = await saveEvent({
      ...event,
      userId: currentUserId
    });
    this.ee.emit("event", currentUserId, currentUserEvent);
    if (!otherUserIds) return currentUserEvent.id;
    for (const userId of otherUserIds) {
      if (userId === currentUserId) continue;
      const savedEvent = await saveEvent({
        ...event,
        userId
      });
      this.ee.emit("event", userId, savedEvent);
    }
    return currentUserEvent.id;
  }
};

// src/change-bus.ts
import { EventEmitter as EventEmitter2, on as on2 } from "events";
function createTrpcChangeBus() {
  const emitter = new EventEmitter2();
  emitter.setMaxListeners(0);
  return {
    /**
     * Announce a committed change without sending row data to subscribers.
     *
     * @param channel The logical collection or refetch channel that changed.
     * @param key The changed row ID, when a single-row fetch is sufficient.
     *   Omit it when a full authorized snapshot is needed.
     */
    publish(channel, key) {
      emitter.emit("change", { channel, key });
    },
    /**
     * Iterate over changes published in this process after subscription.
     *
     * @param signal Aborts the iterator when the tRPC subscription closes.
     * @returns An async iterable of channel and optional row-key signals.
     */
    changes(signal) {
      const events = on2(emitter, "change", { signal });
      return {
        async *[Symbol.asyncIterator]() {
          for await (const [change] of events) {
            yield change;
          }
        }
      };
    }
  };
}
export {
  TrpcSync,
  createTrpcChangeBus
};
//# sourceMappingURL=server.js.map