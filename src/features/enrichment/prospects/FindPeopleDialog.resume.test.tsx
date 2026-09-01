// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const BATCH = "22222222-2222-4222-8222-222222222222";

const batch = vi.hoisted(() => ({
  items: ["Ada Lovelace", "Grace Hopper"].map((fullName, index) => ({
    providerRef: `r${index}`,
    profile: { providerRef: `r${index}`, fullName, hasEmail: true, hasPhone: false },
    outcomes: [],
    fields: [],
    match: { kind: "new" },
  })),
  failures: [],
  mappingsFingerprint: "fp-resume",
}));
const batchQuery = vi.hoisted(() => vi.fn());

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
        useQuery: () => ({
          data: undefined,
          isSuccess: false,
          isFetching: false,
          error: null,
          refetch: () => Promise.resolve({}),
        }),
      },
      resumableBatch: {
        useQuery: () => ({ data: { batchId: "22222222-2222-4222-8222-222222222222", count: 2 } }),
      },
      revealBatch: {
        useQuery: (input: { batchId: string }, options: { enabled: boolean }) => {
          batchQuery(input, options);
          return { data: options.enabled ? batch : undefined };
        },
      },
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

describe("FindPeopleDialog resume", () => {
  it("offers a paid batch from an earlier session and opens it for review", async () => {
    const user = userEvent.setup();
    render(<FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={noop} />);

    expect(
      screen.getByText("2 revealed people from an earlier session are waiting."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review them" }));

    expect(await screen.findByText("Review what came back")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(batchQuery).toHaveBeenCalledWith(
      { orgId: ORG, batchId: BATCH },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("starts a fresh search when the banner is dismissed", async () => {
    const user = userEvent.setup();
    render(<FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={noop} />);

    await user.click(screen.getByRole("button", { name: "Start a new search" }));

    expect(
      screen.queryByText("2 revealed people from an earlier session are waiting."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });
});
