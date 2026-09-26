import type { CollectionConfig } from "@tanstack/react-db";

type Subscription = { unsubscribe: () => void };
type Change<TKey extends string | number> = { key?: TKey };

/**
 * Sync a caller-scoped tRPC list while fetching just the changed row when a
 * signal includes its key. The caller owns authorization and transport sharing.
 */
export function scopedTrpcCollectionOptions<
  T extends object,
  TKey extends string | number,
>({
  id,
  getKey,
  list,
  getOne,
  listen,
}: {
  id: string;
  getKey: (row: T) => TKey;
  list: () => Promise<T[]>;
  getOne?: (key: TKey) => Promise<T | null>;
  listen: (onChange: (change: Change<TKey>) => void) => Subscription;
}): Pick<CollectionConfig<T, TKey>, "id" | "getKey" | "sync"> {
  return {
    id,
    getKey,
    sync: {
      rowUpdateMode: "partial",
      sync({ collection, begin, truncate, write, commit, markReady, markError }) {
        let active = true;
        let ready = false;
        let pending = Promise.resolve();

        const enqueue = (operation: () => Promise<void>) => {
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

        const onChange = ({ key }: Change<TKey>) => {
          if (key === undefined || !getOne) {
            enqueue(refresh);
            return;
          }

          enqueue(async () => {
            let row: T | null;
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
                value: row,
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
      },
    },
  };
}
