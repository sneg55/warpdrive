// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

describe("RichTextBody – basic render + onChange", () => {
  it("renders an editable region without error", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    render(<RichTextBody html="" onChange={onChange} />);
    await waitFor(() => {
      expect(document.querySelector("[contenteditable]")).toBeInTheDocument();
    });
  });

  it("calls onChange with sanitised HTML when content changes", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    render(<RichTextBody html="<p>Hello</p>" onChange={onChange} />);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string;
    expect(lastCall).toContain("Hello");
  });
});

describe("RichTextBody – link affordance", () => {
  it("styles anchors inside the editor surface", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    render(<RichTextBody html='<p><a href="https://example.com">x</a></p>' onChange={vi.fn()} />);
    await waitFor(() => {
      expect(document.querySelector("[contenteditable]")).toBeInTheDocument();
    });
    const surface = document.querySelector("[contenteditable]")?.parentElement;
    const classes = surface?.className ?? "";
    expect(classes).toContain("[&_.ProseMirror_a]:text-link");
    expect(classes).toContain("[&_.ProseMirror_a]:underline");
  });
});

describe("RichTextBody – clears editor when html resets to empty string", () => {
  it("emits empty body when html prop is reset to empty string", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    const { rerender } = render(
      <RichTextBody html="<p>Original content</p>" onChange={onChange} />,
    );

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    rerender(<RichTextBody html="" onChange={onChange} />);

    await waitFor(() => {
      const calls = onChange.mock.calls;
      const lastCall = calls[calls.length - 1]![0] as string;
      expect(lastCall).not.toContain("Original content");
    });
  });
});

describe("RichTextBody – syncs to html prop when template is applied", () => {
  it("emits the template body after html prop changes to a non-empty value", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
    const { rerender } = render(<RichTextBody html="" onChange={onChange} />);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();

    rerender(<RichTextBody html="<p>Template content</p>" onChange={onChange} />);

    await waitFor(() => {
      const calls = onChange.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const last = calls[calls.length - 1]![0] as string;
      expect(last).toContain("Template content");
    });
  });
});

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
      expect(last).not.toMatch(/<b>Acme/);
      expect(last).toMatch(/Acme/);
    });
  });
});

describe("RichTextBody – sanitise on the way out", () => {
  it("strips script tags from initial HTML before passing to onChange", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const onChange = vi.fn();
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

describe("RichTextBody – toolbar placement", () => {
  it("places the format toolbar below the editor body (PD parity)", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    render(<RichTextBody html="<p>x</p>" onChange={vi.fn()} />);
    await waitFor(() => {
      expect(document.querySelector("[contenteditable]")).toBeInTheDocument();
    });
    const editor = document.querySelector("[contenteditable]");
    const toolbar = document.querySelector('[role="toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(
      editor && toolbar
        ? editor.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING
        : 0,
    ).toBeTruthy();
  });
});

describe("RichTextBody – editor frame", () => {
  it("applies frameClassName to the editor frame wrapper (email composer card)", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const { container } = render(
      <RichTextBody html="" onChange={vi.fn()} frameClassName="rounded-md border bg-background" />,
    );
    await waitFor(() => {
      expect(document.querySelector("[contenteditable]")).toBeInTheDocument();
    });
    expect(container.querySelector("div.rounded-md.border.bg-background")).not.toBeNull();
  });

  it("makes the editor fill available height when grow is set (full-pane composer)", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const { container } = render(<RichTextBody html="" onChange={vi.fn()} grow />);
    await waitFor(() => {
      expect(document.querySelector("[contenteditable]")).toBeInTheDocument();
    });
    const frame = container.querySelector("div.flex-1.min-h-0");
    expect(frame).not.toBeNull();
    expect(container.querySelector("div.flex-1.min-h-0 .overflow-y-auto")).not.toBeNull();
  });

  it("does not stretch the editor by default (settings/activity note keep intrinsic height)", async () => {
    const { RichTextBody } = await import("./RichTextBody");
    const { container } = render(<RichTextBody html="" onChange={vi.fn()} />);
    await waitFor(() => {
      expect(document.querySelector("[contenteditable]")).toBeInTheDocument();
    });
    expect(container.querySelector("div.flex-1")).toBeNull();
  });
});
