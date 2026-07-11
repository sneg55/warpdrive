import type { PgBoss } from "pg-boss";
import { describe, expect, it, vi } from "vitest";
import { startAppBoss } from "./appInstrumentation";

describe("startAppBoss", () => {
  it("starts a boss and publishes it before returning", async () => {
    let didStart = false;
    const boss = {
      start: vi.fn((): Promise<PgBoss> => {
        didStart = true;
        return Promise.resolve(boss);
      }),
    } as unknown as PgBoss;
    const createBoss = vi.fn(() => boss);
    const setBoss = vi.fn();

    const result = await startAppBoss({ createBoss, setBoss });

    expect(result).toBe(boss);
    expect(didStart).toBe(true);
    expect(setBoss).toHaveBeenCalledExactlyOnceWith(boss);
  });

  it("publishes the boss only after start resolves (producers never see an unstarted boss)", async () => {
    const order: string[] = [];
    const boss = {
      start: vi.fn((): Promise<PgBoss> => {
        order.push("start");
        return Promise.resolve(boss);
      }),
    } as unknown as PgBoss;
    const createBoss = vi.fn(() => boss);
    const setBoss = vi.fn(() => {
      order.push("setBoss");
    });

    await startAppBoss({ createBoss, setBoss });

    expect(order).toEqual(["start", "setBoss"]);
  });
});
