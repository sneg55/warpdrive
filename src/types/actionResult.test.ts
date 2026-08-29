import { describe, expect, test } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { clientErr } from "./actionResult";

describe("clientErr", () => {
  test("carries the id a caller has to branch on", () => {
    const r = clientErr(new AppError(ERROR_IDS.GMAIL_GRANT_REVOKED, "revoked"));
    expect(r.ok).toBe(false);
    expect(r.error.id).toBe(ERROR_IDS.GMAIL_GRANT_REVOKED);
  });

  test("is a plain object, because React serializes an Error as an opaque record and drops its id", () => {
    const r = clientErr(new AppError(ERROR_IDS.PERM_DENIED, "denied"));
    expect(r.error).not.toBeInstanceOf(Error);
    expect(Object.getPrototypeOf(r.error)).toBe(Object.prototype);
  });

  test("survives a structured clone, so it crosses the server-action boundary intact", () => {
    const r = clientErr(new AppError(ERROR_IDS.GMAIL_API_EXHAUSTED, "exhausted", { a: 1 }));
    expect(structuredClone(r)).toEqual({ ok: false, error: { id: ERROR_IDS.GMAIL_API_EXHAUSTED } });
  });

  test("drops the context, which can hold data the client has no business reading", () => {
    const r = clientErr(new AppError(ERROR_IDS.PERM_DENIED, "denied", { accountId: "secret" }));
    expect(JSON.stringify(r)).not.toContain("secret");
  });
});
