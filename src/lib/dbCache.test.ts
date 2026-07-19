import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { createDbCache } from "./dbCache";

afterEach(() => {
  vi.useRealTimers();
});

// The cache keys on the Db instance; tests pass plain objects cast to Db as distinct keys.
const asDb = (o: object): Db => o as unknown as Db;

describe("createDbCache", () => {
  it("returns a set value for the same db + key", () => {
    const cache = createDbCache<number>(10_000);
    const db = asDb({});
    cache.set(db, "k", 7);
    expect(cache.get(db, "k")).toBe(7);
  });

  it("isolates entries per db instance (no cross-database leakage)", () => {
    const cache = createDbCache<number>(10_000);
    const dbA = asDb({});
    const dbB = asDb({});
    cache.set(dbA, "k", 1);
    expect(cache.get(dbB, "k")).toBeUndefined();
  });

  it("invalidate(db) drops that db's entries", () => {
    const cache = createDbCache<number>(10_000);
    const db = asDb({});
    cache.set(db, "k", 1);
    cache.invalidate(db);
    expect(cache.get(db, "k")).toBeUndefined();
  });

  it("expires an entry after the TTL so a missed invalidation self-heals", () => {
    vi.useFakeTimers();
    const cache = createDbCache<number>(1_000);
    const db = asDb({});
    cache.set(db, "k", 1);
    vi.advanceTimersByTime(999);
    expect(cache.get(db, "k")).toBe(1);
    vi.advanceTimersByTime(2);
    expect(cache.get(db, "k")).toBeUndefined();
  });
});
