// @vitest-environment jsdom
// Link insertion against a REAL TipTap editor (not a stub chain), because the interesting
// failure mode lives in ProseMirror's mark semantics: applying a link mark over an empty
// (collapsed) selection marks nothing, so the toolbar silently produced no link at all.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { FormatToolbar } from "./FormatToolbar";
import { richTextExtensions } from "./richText.extensions";

afterEach(cleanup);

// jsdom has no layout engine, so ProseMirror's scrollToSelection blows up on Text nodes that
// lack getClientRects/getBoundingClientRect. Stub zero-size rects: the tests assert on document
// content, never on geometry.
beforeAll(() => {
  const rect = new DOMRect(0, 0, 0, 0);
  const rects = Object.assign([], { item: () => null });
  for (const proto of [Text.prototype, Element.prototype, Range.prototype]) {
    Object.defineProperty(proto, "getClientRects", { value: () => rects, configurable: true });
    Object.defineProperty(proto, "getBoundingClientRect", {
      value: () => rect,
      configurable: true,
    });
  }
});

// Mounts a real editor plus the toolbar, handing the instance back to the test so assertions
// read the editor document directly (not a React-rendered copy that may lag a transaction).
// `selection` is applied once on create.
function Harness({
  content,
  selection,
  onReady,
}: {
  content: string;
  selection?: { from: number; to: number };
  onReady: (editor: Editor) => void;
}): React.ReactNode {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: richTextExtensions,
    content,
    onCreate({ editor: e }) {
      if (selection !== undefined) e.commands.setTextSelection(selection);
      onReady(e);
    },
  });
  if (editor === null) return null;
  return (
    <div>
      <EditorContent editor={editor} />
      <FormatToolbar editor={editor} />
    </div>
  );
}

// Renders the harness and resolves once the editor exists.
async function mountEditor(
  content: string,
  selection?: { from: number; to: number },
): Promise<() => string> {
  let editor: Editor | null = null;
  render(
    <Harness
      content={content}
      selection={selection}
      onReady={(e) => {
        editor = e;
      }}
    />,
  );
  await waitFor(() => {
    expect(editor).not.toBeNull();
  });
  return () => editor?.getHTML() ?? "";
}

async function insertLink(url: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^link$/i }));
  await user.type(screen.getByLabelText(/link url/i), url);
  await user.click(screen.getByRole("button", { name: /insert link/i }));
}

describe("FormatToolbar link insertion (real editor)", () => {
  it("inserts the URL as clickable link text when nothing is selected", async () => {
    const html = await mountEditor("<p>Book a call: </p>");
    await insertLink("https://calendly.com/nick");
    await waitFor(() => {
      expect(html()).toContain('href="https://calendly.com/nick"');
      expect(html()).toContain(">https://calendly.com/nick</a>");
    });
  });

  it("links the selected text, keeping it as the link label", async () => {
    // "My Linkedin" occupies positions 1..12 in a single paragraph.
    const html = await mountEditor("<p>My Linkedin</p>", { from: 1, to: 12 });
    await insertLink("https://linkedin.com/in/nick");
    await waitFor(() => {
      expect(html()).toContain('href="https://linkedin.com/in/nick"');
      expect(html()).toContain(">My Linkedin</a>");
    });
  });
});
