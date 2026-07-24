// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RecordLink } from "./RecordLink";
import { useRecordPreview } from "./recordPreviewStore";

afterEach(() => {
  cleanup();
  useRecordPreview.getState().clearPreview();
});

describe("RecordLink", () => {
  it("captures the record preview when clicked, before navigating", () => {
    render(
      <RecordLink
        href="/contacts/people/p1"
        preview={{ id: "p1", title: "Jane Roe", subtitle: "Acme Corp" }}
      >
        Jane Roe
      </RecordLink>,
    );
    expect(useRecordPreview.getState().preview).toBeNull();
    fireEvent.click(screen.getByText("Jane Roe"));
    expect(useRecordPreview.getState().preview).toEqual({
      id: "p1",
      title: "Jane Roe",
      subtitle: "Acme Corp",
    });
  });

  it("renders an anchor to the href", () => {
    render(
      <RecordLink href="/contacts/orgs/o1" preview={{ id: "o1", title: "Acme Corp" }}>
        Acme Corp
      </RecordLink>,
    );
    expect(screen.getByText("Acme Corp").closest("a")).toHaveAttribute("href", "/contacts/orgs/o1");
  });
});
