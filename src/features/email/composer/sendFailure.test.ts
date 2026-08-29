import { describe, expect, test } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { COMPOSER_STRINGS } from "./composer.constants";
import { sendFailureMessage } from "./sendFailure";

describe("sendFailureMessage", () => {
  test("a build that moved under an open page asks for a reload, never a retry", () => {
    const msg = sendFailureMessage(ERROR_IDS.UI_STALE_BUILD);
    expect(msg).toContain("Reload");
    expect(msg).not.toMatch(/try again/i);
  });

  test("a revoked Google grant names reconnecting, not retrying", () => {
    const msg = sendFailureMessage(ERROR_IDS.GMAIL_GRANT_REVOKED);
    expect(msg).toMatch(/reconnect/i);
    expect(msg).not.toMatch(/try again/i);
  });

  test("an unreadable attachment points at the attachment", () => {
    expect(sendFailureMessage(ERROR_IDS.GMAIL_ATTACHMENT_DENIED)).toMatch(/attachment/i);
  });

  test("a dead session asks for a reload rather than a blind retry", () => {
    expect(sendFailureMessage(ERROR_IDS.PERM_DENIED)).toContain("Reload");
  });

  test("a transient Gmail failure is the one case where retrying is the advice", () => {
    expect(sendFailureMessage(ERROR_IDS.GMAIL_API_EXHAUSTED)).toMatch(/again/i);
  });

  test("an unconfirmed send never asserts the mail failed", () => {
    const msg = sendFailureMessage(ERROR_IDS.UI_ACTION_UNCONFIRMED);
    expect(msg).toBe(COMPOSER_STRINGS.sendUnconfirmed);
  });

  test("an id with no mapping still says something, rather than rendering the id", () => {
    const msg = sendFailureMessage("E_GMAIL_999");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toContain("E_GMAIL_999");
  });

  test("every distinct cause reads differently, so the banner is diagnostic", () => {
    const ids = [
      ERROR_IDS.UI_STALE_BUILD,
      ERROR_IDS.GMAIL_GRANT_REVOKED,
      ERROR_IDS.GMAIL_ATTACHMENT_DENIED,
      ERROR_IDS.PERM_DENIED,
      ERROR_IDS.GMAIL_SEND_INPUT_INVALID,
      ERROR_IDS.GMAIL_TOKEN_DECRYPT_FAILED,
    ];
    const messages = ids.map((id) => sendFailureMessage(id));
    expect(new Set(messages).size).toBe(ids.length);
  });
});
