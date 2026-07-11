import { describe, expect, it } from "vitest";
import {
  CLAIM_LEASE_SECONDS,
  EMAIL_SEND_STATUS,
  EMAIL_VISIBILITY,
  SYNC_CADENCE_SECONDS,
} from "./email";
import { ERROR_IDS } from "./errorIds";

describe("email constants", () => {
  it("declares the send-status state machine values", () => {
    expect(EMAIL_SEND_STATUS).toEqual(["pending", "sending", "sent", "failed", "needs_review"]);
  });
  it("declares the two visibility values", () => {
    expect(EMAIL_VISIBILITY).toEqual(["private", "shared"]);
  });
  it("pins the polling cadence and claim lease", () => {
    expect(SYNC_CADENCE_SECONDS).toBe(90);
    expect(CLAIM_LEASE_SECONDS).toBe(120);
  });
  it("registers the new gmail and sync error ids", () => {
    expect(Object.values(ERROR_IDS)).toContain("E_GMAIL_002");
    expect(Object.values(ERROR_IDS)).toContain("E_SYNC_001");
    expect(Object.values(ERROR_IDS)).toContain("E_FILE_002");
  });
});
