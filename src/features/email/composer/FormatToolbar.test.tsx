// @vitest-environment jsdom
// FormatToolbar unit tests – command wiring and URL security.
//
// FormatToolbar accepts an `editor` prop directly, so we pass a stub editor
// whose chain().focus().<cmd>().run() methods are spied. No need to mount
// RichTextBody or leak a test-only onEditorReady callback into production.
//
// Fix 2 (SECURITY): Link and Image handlers must reject dangerous URL schemes.
// Fix 4 (QUALITY): Replaces the onEditorReady-based tests from RichTextBody.test.tsx.
//
// Font/size/color controls (Spec 6.5) are tested in FormatToolbar.fontControls.test.tsx.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRunSpy(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

function buildStubChain(runSpy: ReturnType<typeof vi.fn>, overrides: Record<string, unknown> = {}) {
  return {
    focus: () => ({
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
      ...overrides,
    }),
  };
}

async function renderToolbar(): Promise<{ runSpy: ReturnType<typeof vi.fn> }> {
  const { FormatToolbar } = await import("./FormatToolbar");
  const runSpy = makeRunSpy();
  const editor = {
    chain: () => buildStubChain(runSpy),
    isDestroyed: false,
    getHTML: () => "",
  } as unknown as Editor;
  render(<FormatToolbar editor={editor} />);
  return { runSpy };
}

// ---------------------------------------------------------------------------
// Toolbar button -> editor command wiring
// ---------------------------------------------------------------------------

describe("FormatToolbar – icon rendering", () => {
  it("renders icon-only command buttons (svg icon, label via aria-label not text)", async () => {
    await renderToolbar();
    const bold = screen.getByRole("button", { name: /bold/i });
    // Icon present, and no visible text label (accessible name comes from aria-label).
    expect(bold.querySelector("svg")).not.toBeNull();
    expect(bold.textContent).toBe("");
  });
});

describe("FormatToolbar – editor command wiring", () => {
  it("Bold button calls toggleBold", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /bold/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Italic button calls toggleItalic", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /italic/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Underline button calls toggleUnderline", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /underline/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Strikethrough button calls toggleStrike", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /strikethrough/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Bulleted list button calls toggleBulletList", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /bulleted list/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Ordered list button calls toggleOrderedList", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /ordered list/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Blockquote button calls toggleBlockquote", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /blockquote/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Undo button calls undo", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Redo button calls redo", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^redo$/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Clear format button calls clearNodes then unsetAllMarks", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /clear format/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Indent button calls sinkListItem", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^indent$/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Outdent button calls liftListItem", async () => {
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^outdent$/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("Link button prompts and calls setLink for a safe URL", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://example.com");
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^link$/i }));
    expect(promptSpy).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalledTimes(1);
    promptSpy.mockRestore();
  });

  it("Image button prompts and calls setImage for a safe URL", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://example.com/img.png");
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^image$/i }));
    expect(promptSpy).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalledTimes(1);
    promptSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Fix 2 (SECURITY): dangerous URL schemes must be rejected before editor call
// ---------------------------------------------------------------------------

describe("FormatToolbar – URL security (Fix 2)", () => {
  it("Link button rejects javascript: URL – does not call setLink", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("javascript:alert(1)");
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^link$/i }));
    expect(runSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("Link button rejects data: URL – does not call setLink", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("data:text/html,<h1>x</h1>");
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^link$/i }));
    expect(runSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("Link button rejects vbscript: URL – does not call setLink", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("vbscript:MsgBox(1)");
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^link$/i }));
    expect(runSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("Link button allows mailto: URL", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("mailto:alice@example.com");
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^link$/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
    promptSpy.mockRestore();
  });

  it("Image button rejects javascript: src – does not call setImage", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("javascript:alert(1)");
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^image$/i }));
    expect(runSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("Image button rejects data:text/html src – does not call setImage", async () => {
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("data:text/html,<script>evil()</script>");
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^image$/i }));
    expect(runSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("Image button allows data:image/ URL", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("data:image/png;base64,abc");
    const { runSpy } = await renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^image$/i }));
    expect(runSpy).toHaveBeenCalledTimes(1);
    promptSpy.mockRestore();
  });
});
