import { describe, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";

const STALE = new Error("Server Action was not found on the server");
vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: (e: unknown) => e === STALE,
}));

import { actionFailureMessage, settleAction } from "./actionFailure";

const COPY = {
  failed: "Could not convert lead",
  retry: "convert the lead",
  unconfirmed: "the lead was converted",
  check: "Check the lead before converting again.",
};

describe("settleAction", () => {
  it("passes a returned Result through untouched", async () => {
    const r = { ok: false as const, error: { id: "E_PERM_001" } };
    expect(await settleAction(() => Promise.resolve(r))).toBe(r);
  });

  it("maps a stale server action to E_UI_002", async () => {
    const r = await settleAction(() => Promise.reject(STALE));
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.UI_STALE_BUILD } });
  });

  it("maps any other rejection to E_UI_003", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await settleAction(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.UI_ACTION_UNCONFIRMED } });
    warn.mockRestore();
  });
});

describe("actionFailureMessage", () => {
  it("asks for a reload on a stale build", () => {
    expect(actionFailureMessage(COPY, ERROR_IDS.UI_STALE_BUILD)).toBe(
      "Warpdrive was updated while this page was open. Reload the page, then convert the lead again. (E_UI_002)",
    );
  });

  it("asks the user to check on an unconfirmed outcome", () => {
    expect(actionFailureMessage(COPY, ERROR_IDS.UI_ACTION_UNCONFIRMED)).toBe(
      "We could not confirm the lead was converted. Check the lead before converting again. (E_UI_003)",
    );
  });

  it("names the error id for a returned error", () => {
    expect(actionFailureMessage(COPY, ERROR_IDS.DB_WRITE_FAILED)).toBe(
      "Could not convert lead (E_DB_003)",
    );
  });
});
