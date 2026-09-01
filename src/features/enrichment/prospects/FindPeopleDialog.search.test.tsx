// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const page = vi.hoisted(() => ({
  profiles: [
    {
      providerRef: "p1",
      fullName: "Ada Lovelace",
      title: "CTO",
      hasEmail: true,
      hasPhone: false,
      match: { kind: "new" },
    },
  ],
  hasMore: false,
  outcome: { provider: "apollo", kind: "ok" },
}));
const refetch = vi.hoisted(() => vi.fn(() => Promise.resolve({})));

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      enrichment: {
        resumableBatch: { invalidate: () => undefined },
        revealBatch: { invalidate: () => undefined },
        searchPeople: { invalidate: () => undefined },
      },
      contacts: {
        listPeopleForOrg: { invalidate: () => undefined },
        contactTimeline: { invalidate: () => undefined },
        listPeople: { invalidate: () => undefined },
        personOptions: { invalidate: () => undefined },
      },
    }),
    enrichment: {
      searchProviders: { useQuery: () => ({ data: ["apollo"], isSuccess: true }) },
      searchPeople: {
        useQuery: (_input: unknown, options: { enabled: boolean }) =>
          options.enabled
            ? { data: page, isSuccess: true, isFetching: false, error: null, refetch }
            : { data: undefined, isSuccess: false, isFetching: false, error: null, refetch },
      },
      resumableBatch: { useQuery: () => ({ data: null }) },
      revealBatch: { useQuery: () => ({ data: undefined }) },
    },
  },
}));
vi.mock("../prospectActions", () => ({ revealProspectsAction: vi.fn() }));
vi.mock("../prospectApplyActions", () => ({ applyProspectsAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));

import { FindPeopleDialog } from "./FindPeopleDialog";

afterEach(cleanup);

const ORG = "11111111-1111-4111-8111-111111111111";
const noop = (): void => undefined;

describe("FindPeopleDialog search", () => {
  it("runs the same search again instead of leaving the results blank", async () => {
    const user = userEvent.setup();
    render(<FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={noop} />);

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });
});
