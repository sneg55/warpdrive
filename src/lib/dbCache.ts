import type { Db } from "@/db/client";

interface Entry<V> {
  value: V;
  expires: number;
}

export interface DbCache<V> {
  get(db: Db, key: string): V | undefined;
  set(db: Db, key: string, value: V): void;
  invalidate(db: Db): void;
}

export function createDbCache<V>(ttlMs: number): DbCache<V> {
  const store = new WeakMap<Db, Map<string, Entry<V>>>();
  return {
    get(db, key) {
      const forDb = store.get(db);
      const entry = forDb?.get(key);
      if (entry === undefined) return undefined;
      if (entry.expires <= Date.now()) {
        forDb?.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(db, key, value) {
      let forDb = store.get(db);
      if (forDb === undefined) {
        forDb = new Map();
        store.set(db, forDb);
      }
      forDb.set(key, { value, expires: Date.now() + ttlMs });
    },
    invalidate(db) {
      store.delete(db);
    },
  };
}
