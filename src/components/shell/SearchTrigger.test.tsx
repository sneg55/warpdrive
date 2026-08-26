// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SearchTrigger } from "./SearchTrigger";

afterEach(cleanup);

// The trigger is w-full inside TopBar's shrinkable search slot, and its placeholder names four
// record types, so on a narrow window the label is wider than the control. Buttons hold a fixed
// height and never wrap their label, so without truncation the text paints past the border.
it("truncates its placeholder instead of letting it escape the control", () => {
  render(<SearchTrigger />);
  expect(screen.getByRole("button", { name: "Open search" })).toHaveClass("truncate");
});
