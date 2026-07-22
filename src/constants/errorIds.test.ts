import { describe, expect, test } from "vitest";
import { AppError, ERROR_IDS, type ErrorId } from "./errorIds";

// RED: items 6, distinct error IDs for signature-ownership and template-visibility
// These must differ from PERM_DENIED (E_PERM_001) so each denial has its own stable ID.

describe("error IDs", () => {
  test("every id matches E_<DOMAIN>_<NNN> with a known domain", () => {
    // Phase 1-2: AUTH, PERM, DEAL, PIPELINE, CONTACT, DB, WS. Phase 3 adds CF, NOTE,
    // IMPORT, ACTIVITY, USER. Phase 4 adds GMAIL, SYNC, FILE. Phase 5 adds NOTIF, SEARCH, STATS.
    // JOBS covers the background-queue boundary. OAUTH covers the MCP authorization server.
    const domains = [
      "AUTH",
      "OAUTH",
      "GMAIL",
      "SYNC",
      "FILE",
      "JOBS",
      "PERM",
      "DEAL",
      "LEAD",
      "PIPELINE",
      "STAGE",
      "CONTACT",
      "DB",
      "WS",
      "CF",
      "NOTE",
      "IMPORT",
      "ACTIVITY",
      "USER",
      "NOTIF",
      "SEARCH",
      "STATS",
      "LABEL",
      "LOSTREASON",
    ];
    for (const id of Object.values(ERROR_IDS)) {
      const m = /^E_([A-Z]+)_(\d{3})$/.exec(id);
      expect(m, `bad id: ${id}`).not.toBeNull();
      expect(domains).toContain(m![1]);
    }
  });

  test("ids are unique", () => {
    const values = Object.values(ERROR_IDS);
    expect(new Set(values).size).toBe(values.length);
  });

  test("AppError carries id and context", () => {
    const e = new AppError(ERROR_IDS.PERM_DENIED, "nope", { userId: "u1" });
    expect(e.id).toBe("E_PERM_001");
    expect(e.context).toEqual({ userId: "u1" });
    expect(e.name).toBe("AppError");
    const id: ErrorId = e.id;
    expect(id).toBeTypeOf("string");
  });

  // Item 6: signature-ownership and template-visibility must have their own IDs
  test("PERM_SIGNATURE_DENIED exists and differs from PERM_DENIED", () => {
    expect(ERROR_IDS.PERM_SIGNATURE_DENIED).toBeDefined();
    expect(ERROR_IDS.PERM_SIGNATURE_DENIED).not.toBe(ERROR_IDS.PERM_DENIED);
  });

  test("PERM_TEMPLATE_DENIED exists and differs from PERM_DENIED", () => {
    expect(ERROR_IDS.PERM_TEMPLATE_DENIED).toBeDefined();
    expect(ERROR_IDS.PERM_TEMPLATE_DENIED).not.toBe(ERROR_IDS.PERM_DENIED);
  });
});
