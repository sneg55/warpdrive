// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ThreadLabelChips } from "./ThreadLabelChips";

afterEach(cleanup);

it("renders a colored chip with human copy for each known label", () => {
  render(<ThreadLabelChips labels={["important", "later"]} />);
  const important = screen.getByText("Important");
  const later = screen.getByText("Later");
  // important -> red, later -> blue, from MAIL_LABEL_COLOR + LABEL_COLOR_CLASSES.
  expect(important).toHaveClass("bg-red-100");
  expect(later).toHaveClass("bg-blue-100");
});

it("maps to_do to its display name and color", () => {
  render(<ThreadLabelChips labels={["to_do"]} />);
  expect(screen.getByText("To do")).toHaveClass("bg-orange-100");
});

it("renders nothing when there are no labels", () => {
  const { container } = render(<ThreadLabelChips labels={[]} />);
  expect(container).toBeEmptyDOMElement();
});

it("skips unknown label tokens", () => {
  render(<ThreadLabelChips labels={["important", "bogus"]} />);
  expect(screen.getByText("Important")).toBeInTheDocument();
  expect(screen.queryByText("bogus")).not.toBeInTheDocument();
});
