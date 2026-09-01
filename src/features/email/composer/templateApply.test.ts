import { describe, expect, it } from "vitest";
import { shouldApplyTemplate } from "./templateApply";

const next = { subject: "Hi Bruno", body: "<p>Bruno</p>" };
const applied = { subject: "Hi Sofia", body: "<p>Sofia</p>" };

describe("shouldApplyTemplate", () => {
  it("applies a newly chosen template", () => {
    expect(
      shouldApplyTemplate({
        isNewSelection: true,
        applied: null,
        next,
        currentSubject: "",
        currentBody: "",
      }),
    ).toBe(true);
  });

  it("re-applies when the values changed and the composer still holds what was applied", () => {
    expect(
      shouldApplyTemplate({
        isNewSelection: false,
        applied,
        next,
        currentSubject: applied.subject,
        currentBody: applied.body,
      }),
    ).toBe(true);
  });

  it("does not overwrite a body the author edited", () => {
    expect(
      shouldApplyTemplate({
        isNewSelection: false,
        applied,
        next,
        currentSubject: applied.subject,
        currentBody: "<p>Sofia, one more thing</p>",
      }),
    ).toBe(false);
  });

  it("does not overwrite a subject the author edited", () => {
    expect(
      shouldApplyTemplate({
        isNewSelection: false,
        applied,
        next,
        currentSubject: "Hi Sofia, quick one",
        currentBody: applied.body,
      }),
    ).toBe(false);
  });

  it("does not re-push identical text when a query refetches in the background", () => {
    expect(
      shouldApplyTemplate({
        isNewSelection: false,
        applied,
        next: applied,
        currentSubject: applied.subject,
        currentBody: applied.body,
      }),
    ).toBe(false);
  });

  it("does nothing for a selection that was never applied", () => {
    expect(
      shouldApplyTemplate({
        isNewSelection: false,
        applied: null,
        next,
        currentSubject: "",
        currentBody: "",
      }),
    ).toBe(false);
  });

  it("ignores the subject when the template has none", () => {
    const bodyOnly = { subject: null, body: "<p>Sofia</p>" };
    expect(
      shouldApplyTemplate({
        isNewSelection: false,
        applied: bodyOnly,
        next: { subject: null, body: "<p>Bruno</p>" },
        currentSubject: "Whatever the author typed",
        currentBody: bodyOnly.body,
      }),
    ).toBe(true);
  });
});
