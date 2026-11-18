import { describe, expect, test } from "vitest";
import { AppError, ERROR_IDS, type ErrorId } from "./errorIds";

describe("error IDs", () => {
  test("every id matches E_<DOMAIN>_<NNN> with a known domain", () => {
    // Phase 1-2: AUTH, PERM, DEAL, PIPELINE, CONTACT, DB, WS. Phase 3 adds CF, NOTE,
    // IMPORT, ACTIVITY, USER. Phase 4 adds GMAIL, SYNC, FILE. Phase 5 adds NOTIF, SEARCH, STATS.
    // JOBS covers the background-queue boundary. OAUTH covers the MCP authorization server.
    // GOAL covers quota goals and their progress. ENRICH covers the lead-research providers.
    // UI covers design-system invariants, e.g. a chart part rendered outside its container.
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
      "GOAL",
      "CONTACT",
      "DB",
      "WS",
      "CF",
      "NOTE",
      "COMMENT",
      "IMPORT",
      "ACTIVITY",
      "USER",
      "NOTIF",
      "SEARCH",
      "STATS",
      "LABEL",
      "LOSTREASON",
      "ENRICH",
      "UI",
      "INTERCOM",
      "X",
      "AINBOX",
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

  test("the Intercom integration has its own ids", () => {
    expect(ERROR_IDS.INTERCOM_HTTP_FAILED).toBe("E_INTERCOM_001");
    expect(ERROR_IDS.INTERCOM_RATE_LIMITED).toBe("E_INTERCOM_002");
    expect(ERROR_IDS.INTERCOM_NETWORK_FAILED).toBe("E_INTERCOM_003");
    expect(ERROR_IDS.INTERCOM_PARSE_FAILED).toBe("E_INTERCOM_004");
    expect(ERROR_IDS.INTERCOM_NOT_FOUND).toBe("E_INTERCOM_005");
    expect(ERROR_IDS.INTERCOM_CONVERSATION_DENIED).toBe("E_INTERCOM_006");
  });
});
