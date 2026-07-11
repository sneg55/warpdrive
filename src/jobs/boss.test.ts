import type { PgBoss } from "pg-boss";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the real boss; identity is all these tests compare.
function fakeBoss(): PgBoss {
  return { send: vi.fn() } as unknown as PgBoss;
}

// The singleton lives on globalThis (see boss.ts), which vi.resetModules() deliberately does not
// clear. Clear it here so each test starts from an unset boss.
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

  // Turbopack compiles src/jobs/boss.ts once per layer, so the production bundle contains two
  // distinct instances of this module: instrumentation.ts calls setBoss on one, and the import /
  // email / reminder producers call getBoss on the other. A module-scoped `let` makes the
  // producer's copy permanently null, and enqueueBatchJob's `if (boss === null) return` then
  // swallows every job silently (a CSV import hangs at status "uploaded" forever). The singleton
  // must therefore live somewhere both copies share. vi.resetModules() reproduces the duplication.
  it("survives module duplication across bundle layers", async () => {
    const writer = await import("./boss");
    const boss = fakeBoss();
    writer.setBoss(boss);

    vi.resetModules();
    const reader = await import("./boss");

    expect(reader.getBoss()).toBe(boss);
  });
});
