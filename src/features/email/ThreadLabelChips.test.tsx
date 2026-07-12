// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The chips resolve names + colors from the mail-label catalog (seeded built-ins + custom labels).
const catalog = [
  { id: "l1", key: "important", name: "Important", color: "red", order: 0 },
  { id: "l2", key: "to_do", name: "To do", color: "orange", order: 1 },
  { id: "l3", key: "later", name: "Later", color: "blue", order: 2 },
  { id: "l4", key: "vip", name: "VIP", color: "purple", order: 3 },
];
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: { list: { useQuery: () => ({ data: catalog }) } },
    useUtils: () => ({ mailLabels: { list: { invalidate: () => undefined } } }),
  },
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("./mailLabelsActions", () => ({
  createMailLabelAction: () => Promise.resolve({ ok: true, value: { key: "new" } }),
}));

import { ThreadLabelChips } from "./ThreadLabelChips";

afterEach(cleanup);

it("renders a colored chip with the catalog name for each applied key", () => {
  render(<ThreadLabelChips labels={["important", "later"]} />);
  expect(screen.getByText("Important")).toHaveClass("bg-red-100");
  expect(screen.getByText("Later")).toHaveClass("bg-blue-100");
});

it("resolves the to_do token to its catalog name and color", () => {
  render(<ThreadLabelChips labels={["to_do"]} />);
  expect(screen.getByText("To do")).toHaveClass("bg-orange-100");
});

it("renders a custom (non-built-in) catalog label", () => {
  render(<ThreadLabelChips labels={["vip"]} />);
  expect(screen.getByText("VIP")).toHaveClass("bg-purple-100");
});

it("renders nothing when there are no labels and no editor", () => {
  const { container } = render(<ThreadLabelChips labels={[]} />);
  expect(container).toBeEmptyDOMElement();
});

it("skips keys with no catalog entry", () => {
  render(<ThreadLabelChips labels={["important", "bogus"]} />);
  expect(screen.getByText("Important")).toBeInTheDocument();
  expect(screen.queryByText("bogus")).not.toBeInTheDocument();
});

// A15 (Pipedrive parity): applied-label chips render uppercase (10px) so they read as tags.
it("renders each chip uppercase (A15)", () => {
  render(<ThreadLabelChips labels={["important"]} />);
  expect(screen.getByText("Important")).toHaveClass("uppercase");
});

// B5 (Pipedrive parity): the label editor hides behind a pencil affordance instead of being an
// always-visible picker. Display-only usage (no onLabelsChange) shows no pencil.
describe("ThreadLabelChips editor behind a pencil (B5)", () => {
  it("shows no pencil affordance when read-only (no onLabelsChange)", () => {
    render(<ThreadLabelChips labels={["important"]} />);
    expect(screen.queryByRole("button", { name: /edit labels/i })).not.toBeInTheDocument();
  });

  it("renders a pencil trigger that reveals the editor only after activation", async () => {
    render(<ThreadLabelChips labels={["important"]} onLabelsChange={() => {}} />);
    // The editor (the "+ Add label" picker) is hidden until the pencil is clicked.
    expect(screen.queryByRole("button", { name: "+ Add label" })).not.toBeInTheDocument();
    const pencil = screen.getByRole("button", { name: /edit labels/i });
    fireEvent.click(pencil);
    // MailLabelPicker is code-split (next/dynamic), so it arrives a tick after the click.
    expect(await screen.findByRole("button", { name: "+ Add label" })).toBeInTheDocument();
  });
});
