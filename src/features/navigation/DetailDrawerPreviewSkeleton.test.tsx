// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DetailDrawerPreviewSkeleton } from "./DetailDrawerPreviewSkeleton";
import { useRecordPreview } from "./recordPreviewStore";

afterEach(() => {
  cleanup();
  useRecordPreview.getState().clearPreview();
});

describe("DetailDrawerPreviewSkeleton", () => {
  it("shows the real record title instantly when a preview matches the route", () => {
    useRecordPreview
      .getState()
      .setPreview({ id: "lead-1", title: "Acme Corp", subtitle: "Jane Roe" });
    render(<DetailDrawerPreviewSkeleton recordId="lead-1" />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Jane Roe")).toBeInTheDocument();
  });

  it("falls back to the plain skeleton when the preview is for a different record", () => {
    useRecordPreview.getState().setPreview({ id: "lead-OTHER", title: "Wrong Co" });
    render(<DetailDrawerPreviewSkeleton recordId="lead-1" />);
    expect(screen.queryByText("Wrong Co")).not.toBeInTheDocument();
    // The loading region still renders (the drawer never freezes).
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("falls back to the plain skeleton when no preview was captured", () => {
    render(<DetailDrawerPreviewSkeleton recordId="lead-1" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
