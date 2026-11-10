import { afterEach, expect, it, vi } from "vitest";
import { createBackfillThreadLister } from "./gmailBackfill";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("returns an operational error when the history request cannot connect", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));
  const result = await createBackfillThreadLister("token")({
    q: "in:inbox",
    signal: AbortSignal.timeout(8000),
  });
  expect(result.ok ? null : result.error.id).toBe("E_GMAIL_001");
});
