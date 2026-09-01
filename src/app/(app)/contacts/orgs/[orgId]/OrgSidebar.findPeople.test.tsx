// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgDetail } from "@/features/contacts/orgsRepo";

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    enrichment: { status: { useQuery: () => ({ data: { ready: true, providers: ["apollo"] } }) } },
    useUtils: () => ({ contacts: { contactTimeline: { invalidate: () => Promise.resolve() } } }),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/features/deal-workspace/sidebar/OrgBlock", () => ({
  OrgBlock: () => <div data-testid="org-block" />,
}));
vi.mock("../../ContactOverviewSection", () => ({
  ContactOverviewSection: () => <div data-testid="overview" />,
}));
vi.mock("./RelatedOrgsPanel", () => ({ RelatedOrgsPanel: () => <div data-testid="related" /> }));
vi.mock("@/features/enrichment/prospects/FindPeopleDialog", () => ({
  FindPeopleDialog: ({ open }: { open: boolean }) => (
    <div data-testid="find-people-dialog">{open ? "open" : "closed"}</div>
  ),
}));

import { OrgSidebar } from "./OrgSidebar";

afterEach(cleanup);

const org = { id: "o1", name: "Acme", labels: [] } as unknown as OrgDetail;

function renderSidebar(): void {
  render(
    <OrgSidebar
      org={org}
      defs={[]}
      baseCurrency="USD"
      relatedOrgs={[] as never}
      orgOptions={[]}
      openDealsCount={0}
      people={[]}
      deals={[]}
      onRelatedChanged={() => undefined}
    />,
  );
}

describe("OrgSidebar find people", () => {
  it("offers it from the People section, where the people it adds show up", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "People options" }));
    expect(await screen.findByRole("menuitem", { name: "Find people" })).toBeInTheDocument();
  });

  it("still offers it from the Organization section it was first wired into", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "Organization options" }));
    expect(await screen.findByRole("menuitem", { name: "Find people" })).toBeInTheDocument();
  });
});
