import { describe, expect, it } from "vitest";
import { cancelOutboxInput, saveDraftInput } from "./folderActions.schemas";

describe("folder action schemas", () => {
  it("saveDraftInput accepts a valid new draft and rejects a bad accountId", () => {
    expect(
      saveDraftInput.safeParse({
        accountId: crypto.randomUUID(),
        subject: "s",
        bodyHtml: "",
        toEmails: ["a@y.com"],
        ccEmails: [],
      }).success,
    ).toBe(true);
    expect(
      saveDraftInput.safeParse({
        accountId: "nope",
        subject: "s",
        bodyHtml: "",
        toEmails: [],
        ccEmails: [],
      }).success,
    ).toBe(false);
  });

  it("saveDraftInput accepts a partial (not-yet-valid) recipient, since a draft is in progress", () => {
    // Autosave fires while the user is mid-typing a recipient chip; requiring a valid email
    // here would silently drop the save. The send path validates addresses, not the draft.
    expect(
      saveDraftInput.safeParse({
        accountId: crypto.randomUUID(),
        subject: "s",
        bodyHtml: "",
        toEmails: ["joe@"],
        ccEmails: [],
      }).success,
    ).toBe(true);
  });

  it("cancelOutboxInput requires a uuid attemptId", () => {
    expect(cancelOutboxInput.safeParse({ attemptId: crypto.randomUUID() }).success).toBe(true);
    expect(cancelOutboxInput.safeParse({ attemptId: "x" }).success).toBe(false);
  });
});
