import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { convertErrorMessage } from "./convertErrorMessage";

describe("convertErrorMessage", () => {
  it("maps permission denied", () => {
    expect(convertErrorMessage(ERROR_IDS.PERM_DENIED)).toMatch(/permission/i);
  });

  it("maps already-converted", () => {
    expect(convertErrorMessage(ERROR_IDS.LEAD_ALREADY_CONVERTED)).toMatch(/already/i);
  });

  it("maps the stale-CAS conflict (surfaced as LEAD_NOT_FOUND)", () => {
    expect(convertErrorMessage(ERROR_IDS.LEAD_NOT_FOUND)).toMatch(/changed|refresh/i);
  });

  it("falls back for unknown ids", () => {
    expect(convertErrorMessage("E_WHATEVER")).toMatch(/could not convert/i);
  });

  it("names the id for a failed write", () => {
    expect(convertErrorMessage(ERROR_IDS.DB_WRITE_FAILED)).toContain("E_DB_003");
  });

  it("asks for a reload on a stale build", () => {
    const m = convertErrorMessage(ERROR_IDS.UI_STALE_BUILD);
    expect(m).toMatch(/reload the page/i);
    expect(m).toContain("E_UI_002");
  });

  it("asks the user to check the lead on an unconfirmed outcome", () => {
    const m = convertErrorMessage(ERROR_IDS.UI_ACTION_UNCONFIRMED);
    expect(m).toMatch(/could not confirm the lead was converted/i);
    expect(m).toContain("E_UI_003");
  });
});
