// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../LinkExistingCombobox", () => ({
  LinkExistingCombobox: (props: {
    kind: "person" | "deal";
    triggerLabel: string;
    onPick: (id: string, label: string) => void;
  }) => (
    <button type="button" data-testid="pick-deal" onClick={() => props.onPick("d1", "Big Deal")}>
      {props.triggerLabel}
    </button>
  ),
}));

vi.mock("@/features/deals/AddDealModal", () => ({
  AddDealModal: (props: { onCreated: (id: string, title: string) => void }) => (
    <button
      type="button"
      data-testid="deal-modal-create"
      onClick={() => props.onCreated("nd1", "New Deal")}
    >
      create deal
    </button>
  ),
}));

let pipelineData: { id: string; name: string; stages: { id: string; name: string }[] }[] = [
  { id: "pl1", name: "Sales", stages: [{ id: "s1", name: "New" }] },
];
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    pipeline: {
      list: {
        useQuery: () => ({ data: pipelineData }),
      },
    },
  },
}));

import { ComposeLinkSidebar } from "./ComposeLinkSidebar";

afterEach(() => {
  cleanup();
  pipelineData = [{ id: "pl1", name: "Sales", stages: [{ id: "s1", name: "New" }] }];
});

const baseProps = {
  dealId: null,
  dealTitle: null,
  onLink: vi.fn(),
  onUnlink: vi.fn(),
};

describe("ComposeLinkSidebar", () => {
  it("renders the deal-or-lead heading and helper copy (PD parity, no project)", () => {
    render(<ComposeLinkSidebar {...baseProps} />);
    expect(screen.getByText("Link to a deal or lead")).toBeInTheDocument();
    expect(
      screen.getByText(/find an existing deal or lead or create a new one/i),
    ).toBeInTheDocument();
  });

  it("calls onLink with the picked deal's id and title", () => {
    const onLink = vi.fn();
    render(<ComposeLinkSidebar {...baseProps} onLink={onLink} />);
    fireEvent.click(screen.getByTestId("pick-deal"));
    expect(onLink).toHaveBeenCalledWith("d1", "Big Deal");
  });

  it("calls onLink with the newly created deal's id and title", () => {
    const onLink = vi.fn();
    render(<ComposeLinkSidebar {...baseProps} onLink={onLink} />);
    fireEvent.click(screen.getByRole("button", { name: "Add new deal" }));
    fireEvent.click(screen.getByTestId("deal-modal-create"));
    expect(onLink).toHaveBeenCalledWith("nd1", "New Deal");
  });

  it('disables "Add new deal" when no pipeline is available', () => {
    pipelineData = [];
    render(<ComposeLinkSidebar {...baseProps} />);
    expect(screen.getByRole("button", { name: "Add new deal" })).toBeDisabled();
  });

  it("shows the linked deal chip and an unlink control when dealId is set", () => {
    const onUnlink = vi.fn();
    render(
      <ComposeLinkSidebar {...baseProps} dealId="d1" dealTitle="Big Deal" onUnlink={onUnlink} />,
    );
    expect(screen.getByText("Big Deal")).toBeInTheDocument();
    expect(screen.queryByTestId("pick-deal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /unlink/i }));
    expect(onUnlink).toHaveBeenCalledTimes(1);
  });
});
