import { afterEach, describe, expect, it } from "vitest";
import { useRecordPreview } from "./recordPreviewStore";

afterEach(() => {
  useRecordPreview.getState().clearPreview();
});

describe("recordPreviewStore", () => {
  it("starts empty", () => {
    expect(useRecordPreview.getState().preview).toBeNull();
  });

  it("holds the preview the caller sets before navigating", () => {
    useRecordPreview
      .getState()
      .setPreview({ id: "lead-1", title: "Acme Corp", subtitle: "Jane Roe" });
    expect(useRecordPreview.getState().preview).toEqual({
      id: "lead-1",
      title: "Acme Corp",
      subtitle: "Jane Roe",
    });
  });

  it("clears back to empty on close", () => {
    useRecordPreview.getState().setPreview({ id: "lead-1", title: "Acme Corp" });
    useRecordPreview.getState().clearPreview();
    expect(useRecordPreview.getState().preview).toBeNull();
  });
});
