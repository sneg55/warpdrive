// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityScopeChips } from "./ActivityScopeChips";
import { noFilter } from "./activityRowsTestHelpers";

afterEach(() => {
  cleanup();
});

const DRILLED = { ...noFilter, pipelineId: "p1", dateBasis: "done" as const };

describe("ActivityScopeChips", () => {
  it("renders nothing for an ordinary filter", () => {
    const { container } = render(
      <ActivityScopeChips filter={noFilter} pipelineName={null} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names the pipeline and clears it on its own", () => {
    const onChange = vi.fn();
    render(<ActivityScopeChips filter={DRILLED} pipelineName="Sales" onChange={onChange} />);
    expect(screen.getByText("Pipeline: Sales")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove pipeline filter" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DRILLED, pipelineId: null });
  });

  it("shows the completed-date basis and switches back to due dates", () => {
    const onChange = vi.fn();
    render(<ActivityScopeChips filter={DRILLED} pipelineName="Sales" onChange={onChange} />);
    expect(screen.getByText("Dates: completed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filter dates by due date instead" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DRILLED, dateBasis: "due" });
  });
});
