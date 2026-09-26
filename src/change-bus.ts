import { EventEmitter, on } from "node:events";

/** A change signal; row data stays behind the caller's authorized query. */
export interface TrpcChange {
  channel: string;
  key?: string;
}

/** Create one process-local change bus for a tRPC subscription router. */
export function createTrpcChangeBus() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  return {
    publish(channel: string, key?: string) {
      emitter.emit("change", { channel, key } satisfies TrpcChange);
    },
    changes(signal?: AbortSignal): AsyncIterable<TrpcChange> {
      const events = on(emitter, "change", { signal });
      return {
        async *[Symbol.asyncIterator]() {
          for await (const [change] of events) {
            yield change as TrpcChange;
          }
        },
      };
    },
  };
}
