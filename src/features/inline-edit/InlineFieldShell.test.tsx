// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineFieldShell } from "./InlineFieldShell";

afterEach(cleanup);

describe("InlineFieldShell (PD view-state mechanism)", () => {
  it("renders the value as plain selectable text, not a button", () => {
    render(<InlineFieldShell label="Value" editing={false} onStartEdit={vi.fn()} value="$1,500" />);
    expect(screen.getByText("$1,500")).toBeInTheDocument();
    // The value itself must not be a click-to-edit target (PD: only the pencil edits).
    expect(screen.getByText("$1,500").closest("button")).toBeNull();
  });

  it("enters edit mode ONLY via the pencil button", () => {
    const onStartEdit = vi.fn();
    render(
      <InlineFieldShell label="Value" editing={false} onStartEdit={onStartEdit} value="$1,500" />,
    );
    fireEvent.click(screen.getByText("$1,500"));
    expect(onStartEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });

  it("renders a link-blue prompt for empty fields that opens the editor directly", () => {
    const onStartEdit = vi.fn();
    render(
      <InlineFieldShell
        label="Expected close date"
        editing={false}
        onStartEdit={onStartEdit}
        value={null}
        emptyPrompt="Set expected close date"
      />,
    );
    const prompt = screen.getByRole("button", { name: "Set expected close date" });
    expect(prompt).toHaveClass("text-link");
    fireEvent.click(prompt);
    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });

  it("keeps the pencil keyboard-reachable: hidden via opacity (stays in tab order), revealed on focus", () => {
    render(<InlineFieldShell label="Value" editing={false} onStartEdit={vi.fn()} value="$1,500" />);
    const pencil = screen.getByRole("button", { name: "Edit Value" });
    // visibility:hidden/display:none would drop the button from the tab order and the
    // accessibility tree (codex P2); opacity keeps it focusable, focus-visible reveals it.
    expect(pencil).not.toHaveClass("invisible");
    expect(pencil.className).toContain("opacity-0");
    expect(pencil.className).toContain("focus-visible:opacity-100");
    pencil.focus();
    expect(pencil).toHaveFocus();
  });

  it("renders the editor children instead of the value while editing", () => {
    render(
      <InlineFieldShell label="Value" editing={true} onStartEdit={vi.fn()} value="$1,500">
        <input aria-label="Value" />
      </InlineFieldShell>,
    );
    expect(screen.getByRole("textbox", { name: "Value" })).toBeInTheDocument();
    expect(screen.queryByText("$1,500")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Value" })).not.toBeInTheDocument();
  });
});
