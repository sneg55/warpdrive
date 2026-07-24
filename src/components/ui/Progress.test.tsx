// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Progress } from "./Progress";

afterEach(cleanup);

it("exposes determinate progress semantics and a transform-based indicator", () => {
  render(<Progress value={35} max={100} label="Import progress" />);

  const progress = screen.getByRole("progressbar", { name: "Import progress" });
  expect(progress).toHaveAttribute("aria-valuenow", "35");
  expect(progress).toHaveAttribute("aria-valuemax", "100");
  expect(progress.firstElementChild).toHaveStyle({ transform: "translateX(-65%)" });
});

it("clamps values to the declared range", () => {
  render(<Progress value={140} max={100} label="Import progress" />);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
});
