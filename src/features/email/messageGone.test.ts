import { describe, expect, test } from "vitest";
import { AppError } from "@/constants/errorIds";
import { messageGoneFromMailbox } from "./messageGone";

describe("messageGoneFromMailbox", () => {
  test("a 404 means the message is no longer in the mailbox and can never be fetched", () => {
    const e = new AppError("E_GMAIL_001", "gmail call failed", { status: 404 });
    expect(messageGoneFromMailbox(e)).toBe(true);
  });

  test("a 429 is the mailbox being throttled, which the next tick can still get", () => {
    const e = new AppError("E_GMAIL_001", "gmail call failed", { status: 429 });
    expect(messageGoneFromMailbox(e)).toBe(false);
  });

  test("a 500 is Gmail, not the message, so the page must retry rather than skip", () => {
    const e = new AppError("E_GMAIL_001", "gmail call failed", { status: 500 });
    expect(messageGoneFromMailbox(e)).toBe(false);
  });

  test("a failure with no status is not assumed to be a missing message", () => {
    expect(messageGoneFromMailbox(new AppError("E_GMAIL_001", "gmail call failed"))).toBe(false);
  });

  test("a schema failure is our parser, not a deleted message, so it must not be skipped silently", () => {
    const e = new AppError("E_GMAIL_001", "gmail response failed schema validation", { body: {} });
    expect(messageGoneFromMailbox(e)).toBe(false);
  });
});
