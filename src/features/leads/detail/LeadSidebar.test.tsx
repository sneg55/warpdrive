// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LeadDetail } from "../leadRepo";
import { LeadSidebar } from "./LeadSidebar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { labels: { listByTarget: { useQuery: () => ({ data: [] }) } } },
}));
vi.mock("@/features/leads/leadServerActions", () => ({
  updateLeadAction: vi.fn(() => Promise.resolve({ ok: true, lead: { id: "l1" } })),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

afterEach(cleanup);

const baseLead: LeadDetail = {
  id: "l1",
  title: "Acme lead",
  value: null,
  personId: "pe1",
  orgId: "o1",
  ownerId: "u1",
  expectedCloseDate: null,
  labels: [],
  sourceChannel: null,
  sourceChannelId: null,
  sourceOrigin: "manually_created",
  visibilityLevel: "owner",
  visibilityGroupId: null,
  visibleToUserIds: [],
  lastActivityAt: null,
  nextActivityAt: null,
  convertedDealId: null,
  archivedAt: null,
  deletedAt: null,
  searchTsv: "'acme':1 'lead':2",
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  personName: null,
  orgName: null,
  ownerName: null,
};

it("uses the shared Pipedrive field tokens (small, medium, right-aligned label)", () => {
  // Shared FieldRow token unified in the A3 sidebar pass: 12px / medium (500) / right-aligned,
  // matching the deal + person + org sidebars that render the same component.
  render(<LeadSidebar lead={baseLead} owners={[]} />);
  const label = screen.getByText("Channel ID");
  expect(label.className).toContain("text-xs");
  expect(label.className).toContain("font-medium");
  expect(label.className).toContain("text-right");
});

it("gives each section a kebab options menu but no misleading edit pencil", () => {
  // CO-2: LeadSidebar sections get the section kebab (Customize fields) + the hide-empty funnel.
  // The old "Edit {section}" pencil was removed: it only re-showed funnel-hidden fields (a
  // duplicate of the funnel toggle) while its label implied a section edit mode, so it read as a
  // dead control. Editing is via clicking a field inline or the header Edit button.
  render(<LeadSidebar lead={baseLead} owners={[]} />);
  const summary = within(screen.getByRole("region", { name: "Summary" }));
  expect(summary.queryByRole("button", { name: /Edit Summary section/i })).not.toBeInTheDocument();
  expect(summary.getByRole("button", { name: /Summary options/i })).toBeInTheDocument();
});

it("the Source section's hide-empty-fields funnel hides blank Channel ID row", () => {
  render(<LeadSidebar lead={baseLead} owners={[]} />);
  const sourceSection = within(screen.getByRole("region", { name: "Source" }));
  expect(sourceSection.getByText("Channel ID")).toBeInTheDocument();
  fireEvent.click(sourceSection.getByRole("button", { name: "Hide empty fields" }));
  expect(sourceSection.queryByText("Channel ID")).not.toBeInTheDocument();
  // Origin is never value-less; it always stays.
  expect(sourceSection.getByText("Origin")).toBeInTheDocument();
});

it("the Person section's hide-empty-fields funnel hides a blank Name row", () => {
  render(<LeadSidebar lead={baseLead} owners={[]} />);
  const personSection = within(screen.getByRole("region", { name: "Person" }));
  expect(personSection.getByText("Name")).toBeInTheDocument();
  fireEvent.click(personSection.getByRole("button", { name: "Hide empty fields" }));
  expect(personSection.queryByText("Name")).not.toBeInTheDocument();
});

it("a filled-in Person name stays visible while the funnel is hiding empties", () => {
  render(<LeadSidebar lead={{ ...baseLead, personName: "Jane Roe" }} owners={[]} />);
  const personSection = within(screen.getByRole("region", { name: "Person" }));
  fireEvent.click(personSection.getByRole("button", { name: "Hide empty fields" }));
  expect(personSection.getByText("Name")).toBeInTheDocument();
  expect(personSection.getByText("Jane Roe")).toBeInTheDocument();
});
