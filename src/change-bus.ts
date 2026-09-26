import { EventEmitter, on } from "node:events";

/** A change signal; row data stays behind the caller's authorized query. */
export interface TrpcChange {
  channel: string;
  key?: string;
}

/**
 * Create a process-local change bus for tRPC subscriptions.
 *
 * Subscribe before issuing the initial list query so writes during loading
 * are observed. Events are not persisted or replayed; reconnecting clients
 * should reload their authorized snapshot. Multiple server processes need a
 * shared transport for cross-process delivery.
 *
 * @returns Methods to publish change signals and consume them until aborted.
 */
export function createTrpcChangeBus() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  return {
    /**
     * Announce a committed change without sending row data to subscribers.
     *
     * @param channel The logical collection or refetch channel that changed.
     * @param key The changed row ID, when a single-row fetch is sufficient.
     *   Omit it when a full authorized snapshot is needed.
     */
    publish(channel: string, key?: string) {
      emitter.emit("change", { channel, key } satisfies TrpcChange);
    },
    /**
     * Iterate over changes published in this process after subscription.
     *
     * @param signal Aborts the iterator when the tRPC subscription closes.
     * @returns An async iterable of channel and optional row-key signals.
     */
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
