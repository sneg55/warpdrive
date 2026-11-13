import { describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { sendErrorForClient } from "./sendClientError";

describe("sendErrorForClient", () => {
  it("passes the refusal detail through", () => {
    const r = sendErrorForClient(
      new AppError(ERROR_IDS.X_SEND_REFUSED, "refused", { detail: "closed", path: "/secret" }),
    );
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.X_SEND_REFUSED, detail: "closed" } });
  });

  it("passes the rate limit reset through", () => {
    const r = sendErrorForClient(
      new AppError(ERROR_IDS.X_RATE_LIMITED, "limit", { resetAtMs: 1_900_000_000_000, path: "/p" }),
    );
    expect(r).toEqual({
      ok: false,
      error: { id: ERROR_IDS.X_RATE_LIMITED, resetAtMs: 1_900_000_000_000 },
    });
  });

  it("drops context for every other error", () => {
    const r = sendErrorForClient(new AppError(ERROR_IDS.X_HTTP_FAILED, "x", { status: 500 }));
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.X_HTTP_FAILED } });
  });

  it("omits a missing reset time", () => {
    const r = sendErrorForClient(
      new AppError(ERROR_IDS.X_RATE_LIMITED, "limit", { resetAtMs: null }),
    );
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.X_RATE_LIMITED } });
  });
});
