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
/** Create one process-local change bus for a tRPC subscription router. */
declare function createTrpcChangeBus(): {
    publish(channel: string, key?: string): void;
    changes(signal?: AbortSignal): AsyncIterable<TrpcChange>;
};

export { TrpcSync, type TrpcSyncEvent, createTrpcChangeBus };
