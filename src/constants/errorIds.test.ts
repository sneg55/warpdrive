import { describe, expect, test } from "vitest";
import { AppError, ERROR_IDS, type ErrorId, RETIRED_ERROR_IDS } from "./errorIds";

describe("error IDs", () => {
  test("every id matches E_<DOMAIN>_<NNN> with a known domain", () => {
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
      "BREVO",
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

  test("retired ids stay registered, searchable and explained so they are never reused", () => {
    expect(RETIRED_ERROR_IDS.get(ERROR_IDS.DEAL_LOST_REASON_REQUIRED)).toMatch(/lost reason/i);
    expect(RETIRED_ERROR_IDS.get(ERROR_IDS.STATS_NO_PIPELINE)).toMatch(/all pipelines/i);
    const live = new Set<string>(Object.values(ERROR_IDS));
    for (const [id, reason] of RETIRED_ERROR_IDS) {
      expect(live.has(id)).toBe(true);
      expect(reason.length).toBeGreaterThan(0);
    }
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

  test("the Brevo integration has its own ids", () => {
    expect(ERROR_IDS.BREVO_HTTP_FAILED).toBe("E_BREVO_001");
    expect(ERROR_IDS.BREVO_RATE_LIMITED).toBe("E_BREVO_002");
    expect(ERROR_IDS.BREVO_NETWORK_FAILED).toBe("E_BREVO_003");
    expect(ERROR_IDS.BREVO_PARSE_FAILED).toBe("E_BREVO_004");
    expect(ERROR_IDS.BREVO_UNAUTHORIZED).toBe("E_BREVO_005");
  });
});
