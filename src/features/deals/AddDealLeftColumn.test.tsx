// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TITLE_MAX_LEN } from "@/constants/fieldLimits";

// LabelField (in the modal) queries the label catalog via tRPC.
vi.mock("@/lib/trpc-client", () => ({
  trpc: { labels: { listByTarget: { useQuery: () => ({ data: [] }) } } },
}));

import { AddDealLeftColumn } from "./AddDealLeftColumn";
import { initialAddDealState } from "./addDealState";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk (Combobox) observes its list's size to manage height; jsdom has no ResizeObserver.
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(cleanup);

const PIPE = "p1";
const STAGE = "s1";

function baseProps(set = vi.fn()) {
  return {
    state: initialAddDealState(PIPE, STAGE),
    set,
    people: [],
    orgs: [],
    pipelines: [{ id: PIPE, name: "Sales", stages: [{ id: STAGE, name: "Qualified" }] }],
    stages: [{ id: STAGE, name: "Qualified" }],
    owners: [{ id: "u1", name: "Alice" }],
    groups: null,
    baseCurrency: "USD",
  };
}

describe("AddDealLeftColumn owner picker", () => {
  it("renders the owner picker as a searchable avatar Combobox and flows a selection into state", () => {
    const set = vi.fn();
    render(<AddDealLeftColumn {...baseProps(set)} />);
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.click(screen.getByText("Alice"));
    expect(set).toHaveBeenCalledWith({ ownerId: "u1" });
  });

  it("keeps the pipeline field a branded Select that resets to the new pipeline's first stage", () => {
    const set = vi.fn();
    render(
      <AddDealLeftColumn
        {...baseProps(set)}
        pipelines={[
          { id: PIPE, name: "Sales", stages: [{ id: STAGE, name: "Qualified" }] },
          { id: "p2", name: "Partnerships", stages: [{ id: "s2", name: "Intro" }] },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Pipeline"));
    fireEvent.click(screen.getByText("Partnerships"));
    expect(set).toHaveBeenCalledWith({ pipelineId: "p2", stageId: "s2" });
  });
});

describe("AddDealLeftColumn title label association", () => {
  it("focuses the title input when its visible Title label is clicked", async () => {
    const user = userEvent.setup();
    render(<AddDealLeftColumn {...baseProps()} />);
    const input = screen.getByRole("textbox", { name: "Deal title" });
    expect(input).not.toHaveFocus();
    await user.click(screen.getByText("Title"));
    expect(input).toHaveFocus();
  });
});

describe("AddDealLeftColumn title counter", () => {
  it("shows a live title character counter that reflects the max length", () => {
    const props = baseProps();
    const { rerender } = render(<AddDealLeftColumn {...props} />);
    expect(screen.getByText(`0/${TITLE_MAX_LEN}`)).toBeInTheDocument();

    rerender(<AddDealLeftColumn {...props} state={{ ...props.state, title: "Acme" }} />);
    expect(screen.getByText(`4/${TITLE_MAX_LEN}`)).toBeInTheDocument();
  });
});
