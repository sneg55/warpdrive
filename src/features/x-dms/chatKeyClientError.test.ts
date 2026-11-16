import { describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { unlockErrorForClient } from "./chatKeyClientError";

describe("unlockErrorForClient", () => {
  it("passes guessesRemaining through for a wrong passcode and nothing else", () => {
    const r = unlockErrorForClient(
      new AppError(ERROR_IDS.X_PASSCODE_WRONG, "wrong", { guessesRemaining: 3, accountId: "a" }),
    );
    expect(r).toEqual({
      ok: false,
      error: { id: ERROR_IDS.X_PASSCODE_WRONG, guessesRemaining: 3 },
    });
  });

  it("drops context for other errors", () => {
    const r = unlockErrorForClient(
      new AppError(ERROR_IDS.X_UNLOCK_FAILED, "failed", { guessesRemaining: 3 }),
    );
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.X_UNLOCK_FAILED } });
  });

  it("omits a non-numeric guessesRemaining", () => {
    const r = unlockErrorForClient(
      new AppError(ERROR_IDS.X_PASSCODE_WRONG, "wrong", { guessesRemaining: "3" }),
    );
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.X_PASSCODE_WRONG } });
  });
});
