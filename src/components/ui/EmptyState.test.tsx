// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

afterEach(cleanup);

it("states what is empty, why, and offers the action it describes", () => {
  render(
    <EmptyState
      title="No archived deals"
      body="Archiving a deal takes it off the board without deleting it."
      action={<button type="button">Back to deals</button>}
    />,
  );

  const region = screen.getByRole("status");
  expect(region).toHaveTextContent("No archived deals");
  expect(region).toHaveTextContent("Archiving a deal takes it off the board without deleting it.");
  expect(screen.getByRole("button", { name: "Back to deals" })).toBeInTheDocument();
});

it("renders without an action when there is no honest one to offer", () => {
  render(<EmptyState title="No goals apply to you yet" body="An admin sets quotas." />);

  expect(screen.getByRole("status")).toHaveTextContent("An admin sets quotas.");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
