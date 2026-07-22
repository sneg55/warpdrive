// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EngagementAxis, monthLabel } from "./EngagementAxis";

afterEach(cleanup);

describe("EngagementAxis", () => {
  it("labels the rightmost (current) month 'Today' like Pipedrive", () => {
    render(
      <table>
        <EngagementAxis months={["2026-05", "2026-06", "2026-07"]} />
      </table>,
    );
    // Past months keep their name; the last column reads Today, not the month name.
    expect(screen.getByText("May 2026")).toBeInTheDocument();
    expect(screen.getByText("Jun 2026")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.queryByText("Jul 2026")).not.toBeInTheDocument();
    expect(screen.getByText("Contact")).toHaveClass("sticky", "left-0");
  });
});

describe("monthLabel", () => {
  it("formats a YYYY-MM key as 'Mon YYYY'", () => {
    expect(monthLabel("2026-04")).toBe("Apr 2026");
  });
});
