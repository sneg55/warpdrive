// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back }) }));

import { DetailDrawer } from "./DetailDrawer";
import { useDetailDrawerClose } from "./detailDrawerClose";

afterEach(() => {
  cleanup();
  back.mockReset();
});

describe("DetailDrawer", () => {
  it("renders the intercepted detail content inside an open dialog", () => {
    render(
      <DetailDrawer title="Person details">
        <p>Acme Jane detail</p>
      </DetailDrawer>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Acme Jane detail")).toBeInTheDocument();
  });

  it("gives the drawer a viewport-scaled width, wider than the Sheet's narrow default cap", () => {
    render(
      <DetailDrawer title="Person details">
        <p>content</p>
      </DetailDrawer>,
    );
    const dialog = screen.getByRole("dialog");
    // Width scales with the viewport (vw units) and lifts the generic Sheet's max-w-3xl (768px)
    // cap to a wider one so the drawer does not read as narrow on large screens.
    expect(dialog.className).toMatch(/w-\[\d+vw\]/);
    expect(dialog.className).not.toContain("max-w-3xl");
    expect(dialog.className).toContain("max-w-[1280px]");
  });

  it("applies a caller-provided contentClassName so a specific surface (the lead drawer) can be wider", () => {
    render(
      <DetailDrawer title="Lead details" contentClassName="w-[75vw] max-w-[1280px]">
        <p>lead content</p>
      </DetailDrawer>,
    );
    const dialog = screen.getByRole("dialog");
    // The lead drawer opts into PD's wider (~75vw) footprint; the default person/org width is unchanged.
    expect(dialog.className).toContain("w-[75vw]");
    expect(dialog.className).not.toContain("w-[66vw]");
  });

  it("calls router.back() when closed via Escape (returns to the list)", () => {
    render(
      <DetailDrawer title="Person details">
        <p>content</p>
      </DetailDrawer>,
    );
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("lets nested detail content dismiss the drawer through the close context", () => {
    // A record deleted from inside the drawer has to dismiss it. Detail content cannot do that with
    // router.push: that is a soft navigation, and Next keeps the previously active @modal slot, so
    // the drawer would stay open on a record that no longer exists.
    function DeleteAction(): React.ReactNode {
      const close = useDetailDrawerClose();
      return (
        <button type="button" onClick={() => close?.()}>
          Delete
        </button>
      );
    }
    render(
      <DetailDrawer title="Lead details">
        <DeleteAction />
      </DetailDrawer>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("reports no drawer to close when the same content renders standalone (deep link / hard load)", () => {
    let seen: (() => void) | null | undefined;
    function Probe(): React.ReactNode {
      seen = useDetailDrawerClose();
      return null;
    }
    render(<Probe />);
    expect(seen).toBeNull();
  });
});
