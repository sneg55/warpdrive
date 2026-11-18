import type { PgBoss } from "pg-boss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";

const BOSS_KEY = Symbol.for("warpdrive.jobs.boss");

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

  it.each(["test", "development"] as const)("returns null with no boss in %s", async (mode) => {
    nodeEnv.value = mode;
    const { requireBoss } = await import("./requireBoss");
    setBoss(null);
    expect(requireBoss()).toBeNull();
  });

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
