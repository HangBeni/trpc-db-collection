import { CollectionConfig } from '@tanstack/react-db';

interface TrpcItem {
    id: string | number;
}

interface TrpcSyncEvent<TItem extends TrpcItem> {
    id: number;
    action: "insert" | "update" | "delete";
    data: TItem;
    userId: string;
}

interface LoggerConfig {
    enabled: boolean;
    level: "debug" | "info" | "error" | "none";
}

interface Serializer {
    parse: <T>(text: string) => T;
    stringify: <T>(value: T) => string;
}

interface TrpcMutationResponse<TItem extends TrpcItem> {
    item: TItem;
    eventId: number;
}
interface RequiredTrpcRouter<TItem extends TrpcItem> {
    list: {
        query: () => Promise<TItem[]>;
    };
    create: {
        mutate: (input: Omit<TItem, "id">) => Promise<TrpcMutationResponse<TItem>>;
    };
    update: {
        mutate: (input: {
            id: TItem["id"];
            data: Partial<TItem>;
        }) => Promise<TrpcMutationResponse<TItem>>;
    };
    delete: {
        mutate: (input: {
            id: TItem["id"];
        }) => Promise<TrpcMutationResponse<TItem>>;
    };
    listen: {
        subscribe: (input: {
            lastEventId: number | null;
        }, opts: {
            onData: (data: {
                id: string;
                data: TrpcSyncEvent<TItem>;
            }) => void;
            onError?: (error: Error) => void;
        }) => {
            unsubscribe: () => void;
        };
    };
}
interface TrpcCollectionConfig<TItem extends TrpcItem> extends Omit<CollectionConfig<TItem>, "onInsert" | "onUpdate" | "onDelete" | "sync" | "getKey"> {
    /**
     * The trpc router to use for syncing data.
     * It needs to have the following methods:
     * - list: query to get all items
     * - create: mutation to create an item
     * - update: mutation to update an item
     * - delete: mutation to delete an item
     * - listen: subscription to listen for changes
     */
    trpcRouter: RequiredTrpcRouter<TItem>;
    /**
     * The name of the collection.
     */
    name: string;
    /**
     * The row update mode to use for syncing data.
     * @default "partial"
     */
    rowUpdateMode?: "partial" | "full";
    /**
     * The logger configuration to use for logging.
     */
    loggerConfig?: LoggerConfig;
    /**
     * The serializer to use for local storage.
     * @default jsonSerializer
     */
    serializer?: Serializer;
    /**
     * Whether to enable local storage sync.
     * @default true
     */
    localStorage?: boolean;
    /**
     * On event callback.
     * @param event The event that occurred.
     */
    onEvent?: (event: TrpcSyncEvent<TItem>) => void;
}
declare function trpcCollectionOptions<TItem extends TrpcItem>(config: TrpcCollectionConfig<TItem>): CollectionConfig<TItem>;

type Subscription = {
    unsubscribe: () => void;
};
type Change<TKey extends string | number> = {
    key?: TKey;
};
/**
 * Sync a caller-scoped tRPC list while fetching just the changed row when a
 * signal includes its key. The caller owns authorization and transport sharing.
 */
declare function scopedTrpcCollectionOptions<T extends object, TKey extends string | number>({ id, getKey, list, getOne, listen, }: {
    id: string;
    getKey: (row: T) => TKey;
    list: () => Promise<T[]>;
    getOne?: (key: TKey) => Promise<T | null>;
    listen: (onChange: (change: Change<TKey>) => void) => Subscription;
}): Pick<CollectionConfig<T, TKey>, "id" | "getKey" | "sync">;

export { type TrpcItem, scopedTrpcCollectionOptions, trpcCollectionOptions };
