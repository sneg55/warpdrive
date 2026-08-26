// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityIcon, EmailIcon, FilesIcon, NotesIcon } from "./composeTabIcons";

afterEach(cleanup);

const ICONS = [
  ["ActivityIcon", ActivityIcon],
  ["NotesIcon", NotesIcon],
  ["EmailIcon", EmailIcon],
  ["FilesIcon", FilesIcon],
] as const;

describe("composeTabIcons", () => {
  it.each(ICONS)("%s is decorative, so the tab's text label names the tab", (_n, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it.each(ICONS)("%s keeps the shared h-4 w-4 tab size", (_n, Icon) => {
    const { container } = render(<Icon />);
    expect(container.querySelector("svg.h-4.w-4.shrink-0")).not.toBeNull();
  });

  it("renders a distinct glyph per tab", () => {
    const shapes = ICONS.map(([, Icon]) => {
      const html = render(<Icon />).container.innerHTML;
      cleanup();
      return html;
    });
    expect(new Set(shapes).size).toBe(ICONS.length);
  });
});
