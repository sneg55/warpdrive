// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Organization } from "@/db/schema";

vi.mock("./OrgBlock", () => ({ OrgBlock: () => <div data-testid="org-block" /> }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    enrichment: { status: { useQuery: () => ({ data: { ready: false, providers: [] } }) } },
    useUtils: () => ({ contacts: { contactTimeline: { invalidate: () => Promise.resolve() } } }),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/contacts/ContactLabelsControl", () => ({
  ContactLabelsControl: (props: { entityType: string; entityId: string; labels: string[] }) => (
    <div data-testid="labels-control">
      {props.entityType}:{props.entityId}:{props.labels.join(",")}
    </div>
  ),
}));

import { OrganizationSection } from "./OrganizationSection";

const org = { id: "o1", labels: ["Warm"] } as unknown as Organization;
const base = {
  org,
  menuItems: [],
  bulkEditing: false,
  onStartBulk: () => {},
  onExitBulk: () => {},
};

afterEach(cleanup);

it("renders the organization labels control when labels are opted in", () => {
  render(<OrganizationSection {...base} showLabels />);
  const control = screen.getByTestId("labels-control");
  expect(control).toHaveTextContent("organization:o1:Warm");
});

it("omits the labels control by default (contact-detail keeps its header control)", () => {
  render(<OrganizationSection {...base} />);
  expect(screen.queryByTestId("labels-control")).not.toBeInTheDocument();
});
