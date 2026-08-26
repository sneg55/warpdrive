// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ACTIVITY_TYPE_ICON_KEYS, ActivityTypeIcon } from "./typeIcons";

afterEach(cleanup);

const KNOWN_KEYS = ["call", "meeting", "task", "email", "deadline", "lunch", "ping"];

describe("ActivityTypeIcon", () => {
  it.each(KNOWN_KEYS)("renders an aria-hidden svg glyph for the %s type", (key) => {
    const { container } = render(<ActivityTypeIcon typeKey={key} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it.each(KNOWN_KEYS)("renders the %s glyph at the shared h-4 w-4 row size", (key) => {
    const { container } = render(<ActivityTypeIcon typeKey={key} />);
    expect(container.querySelector("svg.h-4.w-4.shrink-0")).not.toBeNull();
  });

  it("renders a distinct glyph for every known type", () => {
    const shapes = KNOWN_KEYS.map((key) => {
      const html = render(<ActivityTypeIcon typeKey={key} />).container.innerHTML;
      cleanup();
      return html;
    });
    expect(new Set(shapes).size).toBe(KNOWN_KEYS.length);
  });

  it("renders a distinct glyph per type (ping differs from call)", () => {
    const call = render(<ActivityTypeIcon typeKey="call" />).container.innerHTML;
    cleanup();
    const ping = render(<ActivityTypeIcon typeKey="ping" />).container.innerHTML;
    expect(ping).not.toBe(call);
  });

  it("renders an aria-hidden fallback for an unknown key without crashing", () => {
    const { container } = render(<ActivityTypeIcon typeKey="totally-unknown" />);
    const el = container.querySelector("[aria-hidden='true']");
    expect(el).not.toBeNull();
  });

  it("exposes the known icon keys (single source of truth), including ping", () => {
    for (const key of KNOWN_KEYS) {
      expect(ACTIVITY_TYPE_ICON_KEYS).toContain(key);
    }
  });
});
