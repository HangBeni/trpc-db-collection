import * as _trpc_server from '@trpc/server';
import EventEmitter, { on } from 'events';

interface TrpcItem {
    id: string | number;
}

interface TrpcSyncEvent<TItem extends TrpcItem> {
    id: number;
    action: "insert" | "update" | "delete";
    data: TItem;
    userId: string;
}
interface EventsEmitterEvents<TItem extends TrpcItem> {
    event: [userId: string, data: TrpcSyncEvent<TItem>];
}
declare class IterableEventEmitter<TItem extends TrpcItem> extends EventEmitter<EventsEmitterEvents<TItem>> {
    toIterable<TEventName extends keyof EventsEmitterEvents<TItem>>(eventName: TEventName, opts?: NonNullable<Parameters<typeof on>[2]>): AsyncIterable<EventsEmitterEvents<TItem>[TEventName]>;
}
declare class TrpcSync<TItem extends TrpcItem> {
    ee: IterableEventEmitter<TItem>;
    constructor();
    eventsSubscription(opts: {
        userId: string;
        signal: AbortSignal | undefined;
        lastEventId?: number | null;
        fetchLastEvents?: (lastEventId: number) => Promise<TrpcSyncEvent<TItem>[]>;
    }): AsyncGenerator<_trpc_server.TrackedEnvelope<TrpcSyncEvent<TItem>>, void, unknown>;
    registerEvent({ currentUserId, otherUserIds, event, saveEvent, }: {
        currentUserId: string;
        otherUserIds?: string[];
        event: Omit<TrpcSyncEvent<TItem>, "id" | "userId">;
        saveEvent: (event: Omit<TrpcSyncEvent<TItem>, "id">) => Promise<TrpcSyncEvent<TItem>>;
    }): Promise<number>;
}

/** A change signal; row data stays behind the caller's authorized query. */
interface TrpcChange {
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
declare function createTrpcChangeBus(): {
    /**
     * Announce a committed change without sending row data to subscribers.
     *
     * @param channel The logical collection or refetch channel that changed.
     * @param key The changed row ID, when a single-row fetch is sufficient.
     *   Omit it when a full authorized snapshot is needed.
     */
    publish(channel: string, key?: string): void;
    /**
     * Iterate over changes published in this process after subscription.
     *
     * @param signal Aborts the iterator when the tRPC subscription closes.
     * @returns An async iterable of channel and optional row-key signals.
     */
    changes(signal?: AbortSignal): AsyncIterable<TrpcChange>;
};

export { TrpcSync, type TrpcSyncEvent, createTrpcChangeBus };
