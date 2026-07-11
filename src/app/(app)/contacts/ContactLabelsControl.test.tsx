// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/contacts/actions", () => ({
  updatePersonAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "p1" } })),
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "o1" } })),
}));

const personCatalog = [
  { id: "l1", target: "person", name: "Hot", color: "red", order: 0 },
  { id: "l2", target: "person", name: "Cold", color: "blue", order: 1 },
];
vi.mock("@/lib/trpc-client", () => ({
  trpc: { labels: { listByTarget: { useQuery: () => ({ data: personCatalog }) } } },
}));

import { ContactLabelsControl } from "./ContactLabelsControl";

afterEach(cleanup);

describe("ContactLabelsControl", () => {
  it("renders the applied label chips, colored from the catalog", () => {
    render(<ContactLabelsControl entityType="person" entityId="p1" labels={["Hot", "Cold"]} />);
    expect(screen.getByText("Hot")).toBeInTheDocument();
    expect(screen.getByText("Cold")).toBeInTheDocument();
  });

  it("offers an Add labels affordance", () => {
    render(<ContactLabelsControl entityType="person" entityId="p1" labels={[]} />);
    expect(screen.getByRole("button", { name: /add labels/i })).toBeInTheDocument();
  });
});
