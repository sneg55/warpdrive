// @vitest-environment node
// updateDealAction and moveDealAction awaited their notification fan-out before returning, so the
// user's request paid for work they never see. That work runs outside the deal transaction on the
// db singleton, which makes it a textbook next/server after() candidate.
//
// The distinction that matters: deferred, NOT dropped. These tests capture the after() callback
// without running it, prove the action already resolved, then run the callback and prove the
// notification actually fires.
import { beforeEach, describe, expect, test, vi } from "vitest";

const afterCallbacks: (() => unknown)[] = [];
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb);
  },
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/features/identity/actions/shared", () => ({
  guardCsrf: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn().mockResolvedValue({
    actor: { id: "actor-1", type: "regular", isActive: true, groupIds: new Set<string>() },
    session: null,
    db: {},
  }),
}));

const deal = { id: "deal-1", updatedAt: new Date("2026-01-01T00:00:00Z") };

const { updateDeal, moveDeal } = vi.hoisted(() => ({
  updateDeal: vi.fn(),
  moveDeal: vi.fn(),
}));
vi.mock("./dealActions", () => ({ updateDeal, moveDeal }));

const { notifyOnDealUpdate, notifyOnDealMove } = vi.hoisted(() => ({
  notifyOnDealUpdate: vi.fn(() => Promise.resolve()),
  notifyOnDealMove: vi.fn(() => Promise.resolve()),
}));
vi.mock("./notifyHelpers", () => ({ notifyOnDealUpdate, notifyOnDealMove }));
vi.mock("@/features/notifications/scrub", () => ({
  scrubInaccessible: vi.fn(() => Promise.resolve()),
}));

import { moveDealAction } from "./moveAction";
import { updateDealAction } from "./updateAction";

beforeEach(() => {
  afterCallbacks.length = 0;
  vi.clearAllMocks();
  updateDeal.mockResolvedValue({ ok: true, value: deal });
  moveDeal.mockResolvedValue({ ok: true, value: deal });
});

describe("updateDealAction defers its notification fan-out", () => {
  test("returns without waiting for notifyOnDealUpdate, then runs it after the response", async () => {
    const r = await updateDealAction({ dealId: "deal-1" } as never, "csrf");

    expect(r.ok).toBe(true);
    // Deferred: the response is ready and the fan-out has not run yet.
    expect(notifyOnDealUpdate).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    // Not dropped: the scheduled work really does send the notification.
    await afterCallbacks[0]?.();
    expect(notifyOnDealUpdate).toHaveBeenCalledTimes(1);
  });

  test("schedules nothing when the update itself failed", async () => {
    updateDeal.mockResolvedValue({ ok: false, error: { id: "E_DEAL_001" } });
    const r = await updateDealAction({ dealId: "deal-1" } as never, "csrf");

    expect(r.ok).toBe(false);
    expect(afterCallbacks).toHaveLength(0);
    expect(notifyOnDealUpdate).not.toHaveBeenCalled();
  });
});

describe("moveDealAction defers its notification fan-out", () => {
  test("returns without waiting for notifyOnDealMove, then runs it after the response", async () => {
    const r = await moveDealAction({ dealId: "deal-1" } as never, "csrf");

    expect(r.ok).toBe(true);
    expect(notifyOnDealMove).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    await afterCallbacks[0]?.();
    expect(notifyOnDealMove).toHaveBeenCalledTimes(1);
  });
});
