import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unlock: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("@/features/identity/actions/shared", () => ({
  guardCsrf: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn().mockResolvedValue({ db: {}, actor: { id: "u" } }),
}));
vi.mock("./clientFromEnv", () => ({ xClientFromEnv: () => ({}) }));
vi.mock("./juicebox", () => ({ juiceboxUnlocker: {} }));
vi.mock("./chatKeys", () => ({ unlockChatKeys: mocks.unlock, removeChatKeys: vi.fn() }));
vi.mock("./enqueue", () => ({ enqueueXChatBackfill: mocks.enqueue }));

import { X_UNLOCK_TIMEOUT_MS } from "@/constants/xDms";
import { unlockChatKeysAction } from "./chatKeyActions";

const accountId = "7f8c1f0e-1b7a-4d4e-9f55-2b8f0a1c9d11";

beforeEach(() => {
  mocks.unlock.mockResolvedValue({ ok: true, value: { keyVersion: "1" } });
});
afterEach(() => vi.restoreAllMocks());

it("keeps the unlock successful when the backfill enqueue throws", async () => {
  mocks.enqueue.mockRejectedValue(new Error("boss down"));
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const r = await unlockChatKeysAction({ accountId, passcode: "1234" }, null);
  expect(r).toEqual({ ok: true, value: { keyVersion: "1" } });
  expect(log).toHaveBeenCalledWith("x unlock: backfill enqueue failed", { accountId });
});

it("gives the unlock a time limit", async () => {
  mocks.enqueue.mockResolvedValue(undefined);
  const timeout = vi.spyOn(AbortSignal, "timeout");
  await unlockChatKeysAction({ accountId, passcode: "1234" }, null);
  expect(X_UNLOCK_TIMEOUT_MS).toBe(30_000);
  expect(timeout).toHaveBeenCalledWith(X_UNLOCK_TIMEOUT_MS);
  expect(mocks.unlock.mock.lastCall?.[2]).toBe(timeout.mock.results[0]?.value);
});

it("enqueues the backfill at once after an unlock", async () => {
  mocks.enqueue.mockReset().mockResolvedValue(undefined);
  await unlockChatKeysAction({ accountId, passcode: "1234" }, null);
  expect(mocks.enqueue.mock.calls).toEqual([[accountId, expect.any(AbortSignal)]]);
});
