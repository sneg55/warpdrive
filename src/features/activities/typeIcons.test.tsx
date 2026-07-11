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
