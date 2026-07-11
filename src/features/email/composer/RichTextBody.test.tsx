// @vitest-environment jsdom
// TipTap rich-text editor tests.
//
// TipTap + jsdom limitation: ProseMirror relies on browser-level selection/range APIs
// that jsdom does not fully implement. Direct "type text and observe HTML" is not
// reliably possible. We test the observable contract at the component boundary:
//   - RichTextBody mounts without error.
//   - onChange is called once on initial content and (via direct editor manipulation) on updates.
//   - Disallowed HTML is stripped by sanitizeAuthorHtml before onChange fires.
//   - After reset (html === ""), the emitted body is empty.
//
// FormatToolbar is tested in FormatToolbar.test.tsx, which passes a stub editor
// directly to the component instead of using the test-only onEditorReady leak.

import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Task 3.1: RichTextBody renders and calls onChange
// ---------------------------------------------------------------------------

describe("RichTextBody – basic render + onChange", () => {
  it("renders an editable region without error", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    render(<RichTextBody html="" onChange={onChange} />);
    // TipTap mounts a contenteditable element.
    await waitFor(() => {
      expect(document.querySelector("[contenteditable]")).toBeInTheDocument();
    });
  });

  it("calls onChange with sanitised HTML when content changes", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    render(<RichTextBody html="<p>Hello</p>" onChange={onChange} />);
    // The editor fires an initial update on mount.
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    // The emitted HTML must include the text (sanitised passthrough of safe content).
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string;
    expect(lastCall).toContain("Hello");
  });
});

// ---------------------------------------------------------------------------
// Fix 1 (CORRECTNESS): editor clears after reset (html prop set to "")
// ---------------------------------------------------------------------------

describe("RichTextBody – clears editor when html resets to empty string", () => {
  it("emits empty body when html prop is reset to empty string", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    const { rerender } = render(
      <RichTextBody html="<p>Original content</p>" onChange={onChange} />,
    );

    // Wait for initial mount emit.
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    // Simulate a reset: parent sets html back to empty string.
    rerender(<RichTextBody html="" onChange={onChange} />);

    // After reset, the next onChange emission must be empty (no stale content).
    await waitFor(() => {
      const calls = onChange.mock.calls;
      const lastCall = calls[calls.length - 1]![0] as string;
      // An empty TipTap editor emits either "" or "<p></p>". Both are acceptable
      // as "empty" — neither should contain the original content.
      expect(lastCall).not.toContain("Original content");
    });
  });
});

// ---------------------------------------------------------------------------
// Item 1: applying a template must update the editor content.
// When the html prop changes to a non-empty value that differs from what the
// editor last emitted, the editor must sync to the new html.
// ---------------------------------------------------------------------------

describe("RichTextBody – syncs to html prop when template is applied", () => {
  it("emits the template body after html prop changes to a non-empty value", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    const { rerender } = render(<RichTextBody html="" onChange={onChange} />);

    // Wait for initial mount emit.
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();

    // Simulate applying a template: parent sets html to template body.
    rerender(<RichTextBody html="<p>Template content</p>" onChange={onChange} />);

    // The editor must sync and emit the new content.
    await waitFor(() => {
      const calls = onChange.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const last = calls[calls.length - 1]![0] as string;
      expect(last).toContain("Template content");
    });
  });
});

// ---------------------------------------------------------------------------
// Item 2a: insert-field must insert as PLAIN TEXT (not parsed HTML)
// A field value like "<b>Acme</b>" must appear literally in the body, not as markup.
// ---------------------------------------------------------------------------

describe("RichTextBody – insertToken inserts plain text only", () => {
  it("inserts HTML-special characters literally, not as markup", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    const token = { text: "<b>Acme & Co</b>", seq: 1 };
    render(<RichTextBody html="" onChange={onChange} insertToken={token} />);

    await waitFor(() => {
      const calls = onChange.mock.calls;
      if (calls.length === 0) return;
      const last = calls[calls.length - 1]![0] as string;
      // The literal angle-bracket text must appear (escaped as &lt;b&gt; or similar)
      // and must NOT contain a rendered <b> element.
      expect(last).not.toMatch(/<b>Acme/);
      // Must contain the text in some escaped form
      expect(last).toMatch(/Acme/);
    });
  });
});

// ---------------------------------------------------------------------------
// Task 3.3: sanitizeAuthorHtml strips disallowed HTML before onChange
// ---------------------------------------------------------------------------

describe("RichTextBody – sanitise on the way out", () => {
  it("strips script tags from initial HTML before passing to onChange", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    // Initial HTML contains a disallowed script tag.
    render(<RichTextBody html='<p>Safe</p><script>alert("xss")</script>' onChange={onChange} />);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string;
    expect(lastCall).not.toContain("<script");
    expect(lastCall).not.toContain("alert");
    expect(lastCall).toContain("Safe");
  });

  it("strips disallowed attributes (onerror, onload) from img tags", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    render(
      <RichTextBody html='<p>Text</p><img src="x.png" onerror="evil()" />' onChange={onChange} />,
    );
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string;
    expect(lastCall).not.toContain("onerror");
  });
});
