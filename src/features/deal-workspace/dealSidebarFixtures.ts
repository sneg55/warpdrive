import type { DealBlockId } from "@/constants/dealBlocks";
import type { DealWorkspace } from "./summaryRepo";

// Test fixtures for DealSidebar.test.tsx, extracted to keep the test file under the size cap.

export type OrgFixtureOverrides = Partial<{
  domain: string | null;
  industry: string | null;
  employeeCount: number | null;
  annualRevenue: string | null;
  linkedinUrl: string | null;
  address: Record<string, unknown> | null;
}>;

export type PersonFixtureOverrides = Partial<{
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  phones: Array<{ label: string; value: string; primary?: boolean }>;
  emails: Array<{ label: string; value: string; primary?: boolean }>;
}>;

// Minimal DealWorkspace fixture: only the fields DealSidebar reads. Cast at the boundary
// so the test does not restate the entire aggregate (DB-backed shape is covered elsewhere).
export function makeWorkspace(
  over: Partial<DealWorkspace["deal"]> = {},
  orgOver: OrgFixtureOverrides = {},
  personOver: PersonFixtureOverrides = {},
): DealWorkspace {
  const deal = {
    id: "d1",
    title: "Acme",
    value: "1000.00",
    labels: ["Hot"],
    sourceChannel: "outbound",
    sourceChannelId: null,
    expectedCloseDate: null,
    customFields: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    lastActivityAt: null,
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...over,
  };
  return {
    deal,
    ownerName: "Owner One",
    person: {
      id: "p1",
      name: "Person One",
      firstName: null,
      lastName: null,
      primaryEmail: "p@x.com",
      phones: [],
      emails: [],
      labels: [],
      ...personOver,
    },
    org: {
      id: "o1",
      name: "Org One",
      domain: null,
      industry: null,
      employeeCount: null,
      annualRevenue: null,
      linkedinUrl: null,
      address: null,
      labels: [],
      ...orgOver,
    },
    customFieldDefs: [],
  } as unknown as DealWorkspace;
}

export const showAll = (): boolean => false;
export const hide =
  (...ids: DealBlockId[]) =>
  (id: DealBlockId): boolean =>
    ids.includes(id);
