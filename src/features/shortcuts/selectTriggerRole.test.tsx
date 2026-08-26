// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { Select } from "@/components/ui/Select";
import { isTypingTarget } from "./shortcutTarget";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(cleanup);

// Guards against the real component rather than a hand-written role="combobox" stand-in: Radix
// drives the trigger with printable-key type-ahead, so a bare shortcut letter must not escape it.
describe("the project's Select trigger", () => {
  test("counts as a typing target", () => {
    const { container } = render(
      <Select
        value="a"
        onChange={() => {}}
        options={[{ value: "a", label: "A" }]}
        ariaLabel="Owner"
      />,
    );
    const trigger = container.querySelector("button");
    expect(trigger).not.toBeNull();
    expect(isTypingTarget(trigger)).toBe(true);
  });

  test("counts as a typing target from a child of the trigger", () => {
    const { container } = render(
      <Select
        value="a"
        onChange={() => {}}
        options={[{ value: "a", label: "A" }]}
        ariaLabel="Owner"
      />,
    );
    const child = container.querySelector("button span");
    expect(child).not.toBeNull();
    expect(isTypingTarget(child)).toBe(true);
  });
});
