// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/contacts/orgs" }));

const listOrgsQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      client: { contacts: { listOrgs: { query: listOrgsQuery } } },
      savedFilters: { listByTarget: { invalidate: vi.fn() } },
    }),
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    labels: {
      listByTarget: { useQuery: () => ({ data: [] }) },
      appliedNames: { useQuery: () => ({ data: [] }) },
    },
    savedFilters: { listByTarget: { useQuery: () => ({ data: [] }) } },
  },
}));

vi.mock("./actions", () => ({
  deleteOrgAction: vi.fn(),
  mergeOrgsAction: vi.fn(),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/identity/preferencesActions", () => ({ setColumnViewAction: vi.fn() }));

import type { CustomFieldDef } from "@/types/customFields";
import { OrgsList } from "./OrgsList";
import type { OrgsListRow } from "./OrgsTable";

afterEach(() => {
  cleanup();
  listOrgsQuery.mockReset();
});

function orgRow(id: string, name: string, overrides?: Partial<OrgsListRow>): OrgsListRow {
  return {
    id,
    name,
    address: null,
    customFields: {},
    peopleCount: 0,
    closedDeals: 0,
    openDeals: 0,
    ...overrides,
  };
}

function customFieldDef(overrides: Partial<CustomFieldDef>): CustomFieldDef {
  return {
    id: "def1",
    targetEntity: "organization",
    type: "text",
    name: "Segment",
    key: "segment",
    options: [],
    isRequired: false,
    isImportant: false,
    showInAddForm: false,
    order: 0,
    archivedAt: null,
    ...overrides,
  };
}

describe("OrgsList custom fields", () => {
  it("lists a custom field under Hidden and reveals its header + value on toggle", async () => {
    const user = userEvent.setup();
    const def = customFieldDef({ key: "segment", name: "Segment", type: "text" });
    render(
      <OrgsList
        rows={[orgRow("o1", "Acme Inc", { customFields: { segment: "Enterprise" } })]}
        total={1}
        customFieldDefs={[def]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Customize columns" }));
    expect(await screen.findByText("Hidden")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Segment" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Segment" }));

    expect(screen.getByRole("columnheader", { name: "Segment" })).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
  });

  it("shows a reference field's resolved name from refLabels.user", async () => {
    const user = userEvent.setup();
    const def = customFieldDef({ key: "csm", name: "CSM", type: "user" });
    render(
      <OrgsList
        rows={[orgRow("o1", "Acme Inc", { customFields: { csm: "user-1" } })]}
        total={1}
        customFieldDefs={[def]}
        refLabels={{ user: { "user-1": "Jamie Fox" }, person: {}, org: {} }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Customize columns" }));
    await user.click(await screen.findByRole("checkbox", { name: "CSM" }));

    expect(screen.getByText("Jamie Fox")).toBeInTheDocument();
  });
});
