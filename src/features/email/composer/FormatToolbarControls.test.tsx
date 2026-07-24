// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { type FormatToolbarActions, FormatToolbarControls } from "./FormatToolbarControls";

const action = vi.fn();
const ACTIONS: FormatToolbarActions = {
  undo: action,
  redo: action,
  bold: action,
  italic: action,
  underline: action,
  strike: action,
  bulletList: action,
  orderedList: action,
  outdent: action,
  indent: action,
  blockquote: action,
  link: action,
  image: action,
  clearFormat: action,
};

it("uses non-overlapping 40px toolbar controls", () => {
  render(
    <FormatToolbarControls
      fontFamily=""
      fontSize=""
      textColor="#000000"
      onFontFamilyChange={vi.fn()}
      onFontSizeChange={vi.fn()}
      onTextColorChange={vi.fn()}
      actions={ACTIONS}
    />,
  );

  for (const button of screen.getAllByRole("button")) {
    expect(button).toHaveClass("size-10");
    expect(button.className).not.toContain("after:size-10");
  }
  for (const select of screen.getAllByRole("combobox")) {
    expect(select).toHaveClass("h-10");
    expect(select.className).not.toContain("after:h-10");
  }
});
