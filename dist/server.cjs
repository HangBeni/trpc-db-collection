"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/server.ts
var server_exports = {};
__export(server_exports, {
  TrpcSync: () => TrpcSync,
  createTrpcChangeBus: () => createTrpcChangeBus
});
module.exports = __toCommonJS(server_exports);

// src/events.ts
var import_events = __toESM(require("events"), 1);
var import_server = require("@trpc/server");
var IterableEventEmitter = class extends import_events.default {
  toIterable(eventName, opts) {
    return (0, import_events.on)(this, eventName, opts);
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
          yield (0, import_server.tracked)(event.id.toString(), event);
        }
      }
    }
    for await (const [userId, data] of iterable) {
      if (userId === opts.userId) {
        yield (0, import_server.tracked)(data.id.toString(), data);
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
var import_node_events = require("events");
function createTrpcChangeBus() {
  const emitter = new import_node_events.EventEmitter();
  emitter.setMaxListeners(0);
  return {
    publish(channel, key) {
      emitter.emit("change", { channel, key });
    },
    changes(signal) {
      const events = (0, import_node_events.on)(emitter, "change", { signal });
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TrpcSync,
  createTrpcChangeBus
});
//# sourceMappingURL=server.cjs.map