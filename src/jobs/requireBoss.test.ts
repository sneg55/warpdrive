import type { PgBoss } from "pg-boss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";

const BOSS_KEY = Symbol.for("warpdrive.jobs.boss");

// The real env module validates process.env at import time and would throw here. Mock it so each
// test can pick the NODE_ENV that matters.
const nodeEnv = vi.hoisted(() => ({ value: "test" }));
vi.mock("@/config/env", () => ({
  get env() {
    return { NODE_ENV: nodeEnv.value };
  },
}));

function setBoss(boss: PgBoss | null): void {
  (globalThis as { [BOSS_KEY]?: PgBoss | null })[BOSS_KEY] = boss;
}

afterEach(() => {
  setBoss(null);
  nodeEnv.value = "test";
});

describe("requireBoss", () => {
  it("returns the live boss when one is set", async () => {
    const { requireBoss } = await import("./requireBoss");
    const boss = { send: vi.fn() } as unknown as PgBoss;
    setBoss(boss);
    expect(requireBoss()).toBe(boss);
  });

  // Tests and one-off scripts run with no queue on purpose; producers must stay callable there.
  it.each(["test", "development"] as const)("returns null with no boss in %s", async (mode) => {
    nodeEnv.value = mode;
    const { requireBoss } = await import("./requireBoss");
    setBoss(null);
    expect(requireBoss()).toBeNull();
  });

  // In production a null boss is a wiring bug, not a legitimate no-op. Returning null here is what
  // let a broken enqueue report success for three days (see the boss-singleton bundle-layer bug):
  // confirmImportUpload dropped the import.prepare job and still returned ok(), so the wizard
  // polled a batch that could never move. Fail loudly instead.
  it("throws in production when no boss was ever set", async () => {
    nodeEnv.value = "production";
    const { requireBoss } = await import("./requireBoss");
    setBoss(null);

    expect(() => requireBoss()).toThrow(AppError);
    try {
      requireBoss();
      expect.unreachable("requireBoss must throw in production with no boss");
    } catch (e) {
      expect((e as AppError).id).toBe(ERROR_IDS.JOBS_BOSS_MISSING);
    }
  });
});
