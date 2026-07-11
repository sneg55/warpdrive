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
});
