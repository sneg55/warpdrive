// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Radix DropdownMenu relies on pointer-capture + scrollIntoView, which jsdom lacks.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const useQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: { pipeline: { list: { useQuery: (...a: unknown[]) => useQuery(...a) } } },
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }));
vi.mock("./GlobalNoteModal", () => ({
  GlobalNoteModal: () => <div data-testid="note-modal" />,
}));
vi.mock("@/features/deals/AddDealModal", () => ({
  AddDealModal: () => <div data-testid="deal-modal" />,
}));
vi.mock("@/features/leads/AddLeadModal", () => ({
  AddLeadModal: () => <div data-testid="lead-modal" />,
}));
vi.mock("./GlobalContactModal", () => ({
  GlobalContactModal: ({ kind }: { kind: string }) => <div data-testid={`contact-modal-${kind}`} />,
}));
vi.mock("@/features/activities/AddActivityModal", () => ({
  AddActivityModal: () => <div data-testid="activity-modal" />,
}));

import { GlobalAddMenu } from "./GlobalAddMenu";

const PIPE = { id: "p1", name: "Sales", stages: [{ id: "s1", name: "Qualified" }] };

describe("GlobalAddMenu", () => {
  it("opens a menu with all five entries and their shortcuts", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue({ data: [PIPE] });
    render(<GlobalAddMenu />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    for (const label of ["Lead", "Deal", "Activity", "Person", "Organization"]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(label) })).toBeInTheDocument();
    }
    // Deal is enabled when a pipeline exists.
    expect(screen.getByRole("menuitem", { name: /Deal/ })).not.toHaveAttribute("data-disabled");
    // Shortcut hints present.
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("opens the Activity modal from the menu entry", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue({ data: [PIPE] });
    render(<GlobalAddMenu />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("menuitem", { name: /Activity/ }));
    expect(screen.getByTestId("activity-modal")).toBeInTheDocument();
  });

  it("opens the Deal modal from the menu entry", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue({ data: [PIPE] });
    render(<GlobalAddMenu />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("menuitem", { name: /Deal/ }));
    expect(screen.getByTestId("deal-modal")).toBeInTheDocument();
  });

  it("opens the Person contact modal from the menu entry", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue({ data: [PIPE] });
    render(<GlobalAddMenu />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("menuitem", { name: /Person/ }));
    expect(screen.getByTestId("contact-modal-person")).toBeInTheDocument();
  });

  it("disables the Deal entry when the pipeline list resolved to empty", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue({ data: [], isSuccess: true });
    render(<GlobalAddMenu />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.getByRole("menuitem", { name: /Deal/ })).toHaveAttribute("data-disabled");
  });

  // A loading or errored pipeline query (data still undefined) must not read as "no pipelines":
  // that false negative left Deal permanently disabled on fresh installs where a pipeline exists.
  it("keeps the Deal entry enabled while the pipeline list is loading or errored", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue({ data: undefined, isSuccess: false });
    render(<GlobalAddMenu />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.getByRole("menuitem", { name: /Deal/ })).not.toHaveAttribute("data-disabled");
  });

  it("opens the Lead modal via the L shortcut while the menu is open", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue({ data: [PIPE] });
    render(<GlobalAddMenu />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.keyboard("l");
    expect(screen.getByTestId("lead-modal")).toBeInTheDocument();
  });

  it("shows Note and Email entries alongside the original five (B5)", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue({ data: [PIPE] });
    render(<GlobalAddMenu />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    for (const label of ["Lead", "Deal", "Activity", "Person", "Organization", "Note", "Email"]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("opens the global note modal from the Note entry", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue({ data: [PIPE] });
    render(<GlobalAddMenu />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("menuitem", { name: /Note/ }));
    expect(screen.getByTestId("note-modal")).toBeInTheDocument();
  });

  it("navigates to the standalone email compose surface from the Email entry", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue({ data: [PIPE] });
    render(<GlobalAddMenu />);
    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("menuitem", { name: /Email/ }));
    expect(push).toHaveBeenCalledWith("/inbox/compose");
  });
});
