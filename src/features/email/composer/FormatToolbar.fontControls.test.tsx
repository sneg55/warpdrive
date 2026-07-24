// @vitest-environment jsdom
// FormatToolbar – font family, font size, and text color controls (Spec 6.5).
//
// These tests verify the presence of the font/size/color selects and color input,
// and that each control fires the correct TipTap editor command on change.
// Tests for command wiring and URL security live in FormatToolbar.test.tsx.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Radix Select (branded dropdown) needs these jsdom polyfills.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helper: find the branded Select's trigger whose aria-label contains a substring.
// Returns the element or throws so tests fail with a clear message.
// ---------------------------------------------------------------------------
function getSelectByLabel(substr: string): HTMLElement {
  const match = screen
    .getAllByRole("combobox")
    .find((el) => (el.getAttribute("aria-label") ?? "").toLowerCase().includes(substr));
  if (match === undefined) {
    throw new Error(`No Select trigger with aria-label containing "${substr}" found in the DOM`);
  }
  return match;
}

// Opens the branded Select by its trigger label, then clicks the option by its text.
function pickOption(labelSubstr: string, optionText: string): void {
  fireEvent.click(getSelectByLabel(labelSubstr));
  fireEvent.click(screen.getByText(optionText));
}

// ---------------------------------------------------------------------------
// Helper: build a minimal Editor stub wired to a single command.
// ---------------------------------------------------------------------------
function makeCommandEditor(commandName: string, runSpy: ReturnType<typeof vi.fn>): Editor {
  const focusObj: Record<string, () => { run: ReturnType<typeof vi.fn> }> = {
    [commandName]: () => ({ run: runSpy }),
  };
  return {
    chain: () => ({ focus: () => focusObj }),
    isDestroyed: false,
    getHTML: () => "",
  } as unknown as Editor;
}

// Full stub – all commands resolve to the same runSpy (used for presence tests).
function makeFullStubEditor(runSpy: ReturnType<typeof vi.fn>): Editor {
  const focus = () => ({
    toggleBold: () => ({ run: runSpy }),
    toggleItalic: () => ({ run: runSpy }),
    toggleUnderline: () => ({ run: runSpy }),
    toggleStrike: () => ({ run: runSpy }),
    toggleBulletList: () => ({ run: runSpy }),
    toggleOrderedList: () => ({ run: runSpy }),
    toggleBlockquote: () => ({ run: runSpy }),
    sinkListItem: () => ({ run: runSpy }),
    liftListItem: () => ({ run: runSpy }),
    undo: () => ({ run: runSpy }),
    redo: () => ({ run: runSpy }),
    clearNodes: () => ({ unsetAllMarks: () => ({ run: runSpy }) }),
    setLink: () => ({ run: runSpy }),
    setImage: () => ({ run: runSpy }),
    setFontFamily: () => ({ run: runSpy }),
    setFontSize: () => ({ run: runSpy }),
    setColor: () => ({ run: runSpy }),
  });
  return {
    chain: () => ({ focus }),
    isDestroyed: false,
    getHTML: () => "",
  } as unknown as Editor;
}

// ---------------------------------------------------------------------------
// Spec 6.5: controls are present
// ---------------------------------------------------------------------------

describe("FormatToolbar – font/size/color controls present (Spec 6.5)", () => {
  it("renders a font-family select", async () => {
    const { FormatToolbar } = await import("./FormatToolbar");
    render(<FormatToolbar editor={makeFullStubEditor(vi.fn())} />);
    expect(getSelectByLabel("font")).toBeInTheDocument();
  });

  it("renders a font-size select", async () => {
    const { FormatToolbar } = await import("./FormatToolbar");
    render(<FormatToolbar editor={makeFullStubEditor(vi.fn())} />);
    expect(getSelectByLabel("size")).toBeInTheDocument();
  });

  it("renders the shared text-color picker instead of a native color input", async () => {
    const { FormatToolbar } = await import("./FormatToolbar");
    render(<FormatToolbar editor={makeFullStubEditor(vi.fn())} />);
    expect(screen.getByRole("button", { name: "Text color" })).toBeInTheDocument();
    expect(document.querySelector('input[type="color"]')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PD parity: font-family/size triggers are compact icon controls, not wide
// "Default ▾" text comboboxes. The trigger's accessible name comes from
// aria-label; it must never fall back to rendering the option's label text.
// ---------------------------------------------------------------------------

describe("FormatToolbar – compact icon-style font triggers (PD parity)", () => {
  it("font-family trigger is an icon control identified by aria-label, not a wide text label", async () => {
    const { FormatToolbar } = await import("./FormatToolbar");
    render(<FormatToolbar editor={makeFullStubEditor(vi.fn())} />);
    const trigger = screen.getByRole("combobox", { name: "Font family" });
    expect(trigger).not.toHaveTextContent("Default");
    expect(trigger.querySelector("svg")).not.toBeNull();
  });

  it("font-size trigger is an icon control identified by aria-label, not a wide text label", async () => {
    const { FormatToolbar } = await import("./FormatToolbar");
    render(<FormatToolbar editor={makeFullStubEditor(vi.fn())} />);
    const trigger = screen.getByRole("combobox", { name: "Font size" });
    expect(trigger).not.toHaveTextContent("Default");
    expect(trigger.querySelector("svg")).not.toBeNull();
  });

  it("font-family trigger stays icon-only after picking a family (does not grow into the option's label text)", async () => {
    const { FormatToolbar } = await import("./FormatToolbar");
    render(<FormatToolbar editor={makeFullStubEditor(vi.fn())} />);
    pickOption("font", "Georgia");
    const trigger = screen.getByRole("combobox", { name: "Font family" });
    expect(trigger).not.toHaveTextContent("Georgia");
    expect(trigger.querySelector("svg")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Spec 6.5: controls fire the right editor commands
// ---------------------------------------------------------------------------

describe("FormatToolbar – font/size/color command wiring (Spec 6.5)", () => {
  it("changing font-family select calls setFontFamily on the editor chain", async () => {
    const { FormatToolbar } = await import("./FormatToolbar");
    const runSpy = vi.fn();
    render(<FormatToolbar editor={makeCommandEditor("setFontFamily", runSpy)} />);
    pickOption("font", "Georgia");
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("changing font-size select calls setFontSize on the editor chain", async () => {
    const { FormatToolbar } = await import("./FormatToolbar");
    const runSpy = vi.fn();
    render(<FormatToolbar editor={makeCommandEditor("setFontSize", runSpy)} />);
    pickOption("size", "18");
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("choosing a text color calls setColor on the editor chain", async () => {
    const { FormatToolbar } = await import("./FormatToolbar");
    const runSpy = vi.fn();
    render(<FormatToolbar editor={makeCommandEditor("setColor", runSpy)} />);
    await userEvent.click(screen.getByRole("button", { name: "Text color" }));
    await userEvent.click(screen.getByRole("button", { name: "Red" }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });
});
