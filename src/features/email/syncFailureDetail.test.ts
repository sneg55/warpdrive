import { describe, expect, test } from "vitest";
import { AppError } from "@/constants/errorIds";
import { syncFailureDetail } from "./syncFailureDetail";

describe("syncFailureDetail", () => {
  test("keeps the HTTP status, which is the whole difference between a throttle and a dead grant", () => {
    const e = new AppError("E_GMAIL_001", "gmail call failed", {
      status: 429,
      statusText: "Too Many Requests",
    });
    expect(syncFailureDetail(e)).toEqual({
      errorId: "E_GMAIL_001",
      cause: "gmail call failed",
      status: 429,
      statusText: "Too Many Requests",
    });
  });

  test("reports a schema failure as a flag, never the body it failed on", () => {
    const e = new AppError("E_GMAIL_001", "gmail response failed schema validation", {
      body: { payload: { headers: [{ name: "To", value: "someone@example.com" }] } },
    });
    const detail = syncFailureDetail(e);
    expect(detail).toEqual({
      errorId: "E_GMAIL_001",
      cause: "gmail response failed schema validation",
      schemaInvalid: true,
    });
    expect(JSON.stringify(detail)).not.toContain("someone@example.com");
  });

  test("never carries a token, an address or a message body out of the context", () => {
    const e = new AppError("E_GMAIL_002", "no usable refresh token", {
      accountId: "acc-1",
      refreshToken: "1//secret",
      from: "owner@example.com",
      snippet: "Hi Blair, the GTFS URL",
    });
    expect(syncFailureDetail(e)).toEqual({
      errorId: "E_GMAIL_002",
      cause: "no usable refresh token",
    });
  });

  test("keeps Google's OAuth error code, which separates a revoked grant from a throttled one", () => {
    const e = new AppError("E_GMAIL_001", "token refresh failed", {
      status: 429,
      oauthError: "rate_limit_exceeded",
    });
    expect(syncFailureDetail(e).oauthError).toBe("rate_limit_exceeded");
  });

  test("an error with no context still names its id, so a log line is never empty", () => {
    expect(syncFailureDetail(new AppError("E_GMAIL_005", "decrypt failed"))).toEqual({
      errorId: "E_GMAIL_005",
      cause: "decrypt failed",
    });
  });
});
