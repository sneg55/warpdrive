// @vitest-environment jsdom
// src/components/ui/dialog.test.tsx
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Select } from "./Select";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
});

function DialogWithSelect({ onClose }: { onClose: () => void }): React.ReactNode {
  const [visibility, setVisibility] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add deal</DialogTitle>
        </DialogHeader>
        <Select
          ariaLabel="Visible to"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: "", label: "Default" },
            { value: "g1", label: "Sales" },
          ]}
        />
      </DialogContent>
    </Dialog>
  );
}

// Radix arms its document-level `pointerdown` listener inside a setTimeout(0), and defers the
// dialog's dismissal to a second setTimeout(0) after the click. Both need a real macrotask to
// elapse, so every step of these tests is separated by one.
async function tick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// The overlay is `fixed inset-0` and sits UNDER the content, so it is the element a real browser
// hit-tests to whenever the content is not accepting pointer events.
function getOverlay(): HTMLElement {
  const overlay = document.querySelector<HTMLElement>("div.fixed.inset-0");
  if (overlay === null) throw new Error("dialog overlay not found");
  return overlay;
}

// A real browser resolves a press over the dialog body to whichever element wins the hit test.
// While a nested Select is open, Radix sets the dialog CONTENT layer to `pointer-events: none`
// (it is no longer the topmost layer) while the overlay keeps `pointer-events: auto`, so the
// press lands on the overlay, i.e. "outside" the content. jsdom does no hit-testing, so the test
// dispatches onto the overlay directly to mirror what the browser actually does.
function pressAndRelease(target: HTMLElement): void {
  fireEvent.pointerDown(target, { button: 0, pointerType: "mouse" });
  fireEvent.mouseDown(target, { button: 0 });
  fireEvent.pointerUp(target, { button: 0, pointerType: "mouse" });
  fireEvent.mouseUp(target, { button: 0 });
  fireEvent.click(target, { button: 0 });
}

describe("Dialog", () => {
  // Regression: opening the "Visible to" Select inside Add deal and then clicking back on the
  // modal without picking anything closed the whole modal. Radix Dialog defers its
  // pointer-down-outside dismissal to the following `click`; the dismissal guard has to be
  // evaluated at pointer-down time, while the Select layer is still on top, not at click time
  // when the Select has already closed and the dialog is topmost again.
  it("stays open when a press that dismisses a nested Select lands on the overlay", async () => {
    const onClose = vi.fn();
    render(<DialogWithSelect onClose={onClose} />);
    await tick();

    fireEvent.click(screen.getByLabelText("Visible to"));
    await tick();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    pressAndRelease(getOverlay());
    await tick();

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // The guard above must not disable the overlay's real job: with no nested layer open, pressing
  // the backdrop still dismisses the dialog.
  it("closes when the overlay is pressed with no nested layer open", async () => {
    const onClose = vi.fn();
    render(<DialogWithSelect onClose={onClose} />);
    await tick();

    pressAndRelease(getOverlay());
    await tick();

    expect(onClose).toHaveBeenCalled();
  });
});
