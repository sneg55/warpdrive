// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(cleanup);

function getSelectByLabel(substr: string): HTMLElement {
  const match = screen
    .getAllByRole("combobox")
    .find((el) => (el.getAttribute("aria-label") ?? "").toLowerCase().includes(substr));
  if (match === undefined) {
    throw new Error(`No Select trigger with aria-label containing "${substr}" found in the DOM`);
  }
  return match;
}

function pickOption(labelSubstr: string, optionText: string): void {
  fireEvent.click(getSelectByLabel(labelSubstr));
  fireEvent.click(screen.getByText(optionText));
}

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
    insertContent: () => ({ unsetMark: () => ({ run: runSpy }) }),
    setImage: () => ({ run: runSpy }),
    setFontFamily: () => ({ run: runSpy }),
    setFontSize: () => ({ run: runSpy }),
    setColor: () => ({ run: runSpy }),
  });
  return {
    chain: () => ({ focus }),
    state: { selection: { empty: false } },
    isDestroyed: false,
    getHTML: () => "",
  } as unknown as Editor;
}

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
