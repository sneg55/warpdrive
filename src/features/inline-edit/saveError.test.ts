import { describe, expect, it } from "vitest";
import { SAVE_ERROR_MESSAGE } from "./constants";
import { saveErrorMessage } from "./saveError";

describe("saveErrorMessage", () => {
  it("explains a permission denial instead of the generic message", () => {
    // E_PERM_001 is what updatePerson/updateOrg return when contact.edit is denied.
    expect(saveErrorMessage("E_PERM_001")).toMatch(/permission/i);
    expect(saveErrorMessage("E_PERM_001")).not.toBe(SAVE_ERROR_MESSAGE);
  });

  it("explains an expired session for auth failures", () => {
    expect(saveErrorMessage("E_AUTH_003")).toMatch(/session|sign in/i);
    expect(saveErrorMessage("E_AUTH_CSRF")).toMatch(/session|refresh/i);
  });

  it("falls back to the generic message for unknown or absent error ids", () => {
    expect(saveErrorMessage("E_SOMETHING_ELSE")).toBe(SAVE_ERROR_MESSAGE);
    expect(saveErrorMessage(undefined)).toBe(SAVE_ERROR_MESSAGE);
  });
});
