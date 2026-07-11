// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineTabs } from "./TimelineTabs";

afterEach(cleanup);

describe("TimelineTabs", () => {
  it("renders a Focus and a History tab", () => {
    render(
      <TimelineTabs view="history" onView={() => {}}>
        <p>content</p>
      </TimelineTabs>,
    );
    expect(screen.getByRole("tab", { name: "Focus" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "History" })).toBeInTheDocument();
  });

  it("marks the active view as aria-selected", () => {
    render(
      <TimelineTabs view="history" onView={() => {}}>
        <p>content</p>
      </TimelineTabs>,
    );
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Focus" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onView with 'focus' when the Focus tab is clicked", () => {
    const onView = vi.fn();
    render(
      <TimelineTabs view="history" onView={onView}>
        <p>content</p>
      </TimelineTabs>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Focus" }));
    expect(onView).toHaveBeenCalledWith("focus");
  });

  it("calls onView with 'history' when the History tab is clicked", () => {
    const onView = vi.fn();
    render(
      <TimelineTabs view="focus" onView={onView}>
        <p>content</p>
      </TimelineTabs>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(onView).toHaveBeenCalledWith("history");
  });

  it("renders children below the tab switch", () => {
    render(
      <TimelineTabs view="focus" onView={() => {}}>
        <p>Nothing needs your attention</p>
      </TimelineTabs>,
    );
    expect(screen.getByText("Nothing needs your attention")).toBeInTheDocument();
  });
});
