import type { Db } from "@/db/client";

// A tiny cross-request cache for near-static per-instance data (custom-field defs, the settings
// singleton). It keys on the Db instance via a WeakMap so per-test databases never share entries
// (integration tests each get a fresh Db, and prod uses one shared pool-backed Db). A short TTL
// bounds staleness even if an invalidation is missed (e.g. a server module duplicated across
// bundle layers reading a different Db copy); mutations call invalidate() for instant coherence in
// the common single-instance case.
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
