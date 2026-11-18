// @vitest-environment jsdom
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

async function tick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function getOverlay(): HTMLElement {
  const overlay = document.querySelector<HTMLElement>("div.fixed.inset-0");
  if (overlay === null) throw new Error("dialog overlay not found");
  return overlay;
}

function pressAndRelease(target: HTMLElement): void {
  fireEvent.pointerDown(target, { button: 0, pointerType: "mouse" });
  fireEvent.mouseDown(target, { button: 0 });
  fireEvent.pointerUp(target, { button: 0, pointerType: "mouse" });
  fireEvent.mouseUp(target, { button: 0 });
  fireEvent.click(target, { button: 0 });
}

describe("Dialog", () => {
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

  it("closes when the overlay is pressed with no nested layer open", async () => {
    const onClose = vi.fn();
    render(<DialogWithSelect onClose={onClose} />);
    await tick();

    pressAndRelease(getOverlay());
    await tick();

    expect(onClose).toHaveBeenCalled();
  });
});
