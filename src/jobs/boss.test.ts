import type { PgBoss } from "pg-boss";
import { beforeEach, describe, expect, it, vi } from "vitest";

function fakeBoss(): PgBoss {
  return { send: vi.fn() } as unknown as PgBoss;
}

const BOSS_KEY = Symbol.for("warpdrive.jobs.boss");

describe("boss singleton", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as { [BOSS_KEY]?: PgBoss | null })[BOSS_KEY];
  });

  it("returns null before anything sets a boss", async () => {
    const { getBoss } = await import("./boss");
    expect(getBoss()).toBeNull();
  });

  it("returns the boss that was set", async () => {
    const { getBoss, setBoss } = await import("./boss");
    const boss = fakeBoss();
    setBoss(boss);
    expect(getBoss()).toBe(boss);
  });

  it("survives module duplication across bundle layers", async () => {
    const writer = await import("./boss");
    const boss = fakeBoss();
    writer.setBoss(boss);

    vi.resetModules();
    const reader = await import("./boss");

    expect(reader.getBoss()).toBe(boss);
  });
});
