// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { Organization, Person } from "@/db/schema";
import type { EnrichmentStatus } from "@/features/enrichment/router";

const status = vi.hoisted<{ value: EnrichmentStatus | undefined }>(() => ({ value: undefined }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    enrichment: { status: { useQuery: () => ({ data: status.value }) } },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    useUtils: () => ({ contacts: { contactTimeline: { invalidate: () => Promise.resolve() } } }),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/features/enrichment/actions", () => ({
  enrichRecordAction: vi.fn(),
  applyEnrichmentAction: vi.fn(),
}));

// Field grids and label controls are irrelevant here: this file asserts one wiring decision, that
// each of the four section components hands the enrichment button to its header.
vi.mock("./PersonBlock", () => ({ PersonBlock: () => <div /> }));
vi.mock("./OrgBlock", () => ({ OrgBlock: () => <div /> }));
vi.mock("./DetailsBlock", () => ({ DetailsBlock: () => <div /> }));
vi.mock("./PersonLinkEditor", () => ({ PersonLinkEditor: () => <div /> }));
vi.mock("@/features/contacts/ContactLabelsControl", () => ({
  ContactLabelsControl: () => <div />,
}));

import { DealPersonSection } from "./DealPersonSection";
import { OrganizationSection } from "./OrganizationSection";
import { PersonSection } from "./PersonSection";
import { RecordOrganizationSection } from "./RecordOrganizationSection";

const BUTTON = ENRICHMENT_STRINGS.button.label;
const person = { id: "p1", name: "Jane Doe", labels: [] } as unknown as Person;
const org = { id: "o1", name: "Acme", labels: [] } as unknown as Organization;

const personProps = {
  person,
  menuItems: [],
  bulkEditing: false,
  onStartBulk: () => {},
  onExitBulk: () => {},
};
const orgProps = { ...personProps, org };
const recordOrgProps = {
  hidden: false,
  org,
  orgMenuItems: [],
  bulkEditing: false,
  onStartBulk: () => {},
  onExitBulk: () => {},
  hiddenOrgFields: new Set<string>(),
  organizationCustomFieldDefs: [],
  currency: "USD",
  customFields: {},
  customFieldDefs: [],
  onSaveCustomFields: () => Promise.resolve({ ok: true as const, value: {} }),
  detailsTitle: "Details",
  detailsMenuItems: [],
};
const dealPersonProps = {
  ...personProps,
  dealId: "d1",
  expectedUpdatedAt: "2026-08-24T09:00:00.000Z",
  personOptions: [],
};

const sections: [string, () => React.ReactNode][] = [
  ["PersonSection", () => <PersonSection {...personProps} />],
  ["DealPersonSection", () => <DealPersonSection {...dealPersonProps} />],
  ["OrganizationSection", () => <OrganizationSection {...orgProps} />],
  ["RecordOrganizationSection", () => <RecordOrganizationSection {...recordOrgProps} />],
];

beforeEach(() => {
  status.value = {
    ready: true,
    providers: [{ provider: "apollo", enabled: true, throttledUntilIso: null }],
  };
});
afterEach(cleanup);

it.each(
  sections,
)("%s offers Fill the gaps once a provider is connected", (_name, renderSection) => {
  render(renderSection());
  expect(screen.getByRole("button", { name: BUTTON })).toBeEnabled();
});

it.each(
  sections,
)("%s renders the header untouched with nothing connected", (_name, renderSection) => {
  status.value = { ready: false, providers: [] };
  render(renderSection());
  expect(screen.queryByRole("button", { name: BUTTON })).not.toBeInTheDocument();
});

it("keeps Fill the gaps off a deal section that has no record to enrich", () => {
  render(<DealPersonSection {...dealPersonProps} person={null} />);
  expect(screen.queryByRole("button", { name: BUTTON })).not.toBeInTheDocument();
});
