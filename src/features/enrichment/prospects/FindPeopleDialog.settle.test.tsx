// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROSPECT_REVEAL_CHUNK } from "@/constants/prospectSearch";

const page = vi.hoisted(() => ({
  profiles: Array.from({ length: 6 }, (_, index) => ({
    providerRef: `p${index}`,
    fullName: `Person ${index}`,
    hasEmail: true,
    hasPhone: false,
    match: { kind: "new" },
  })),
  hasMore: false,
  outcome: { provider: "apollo", kind: "ok" },
}));

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
        useQuery: (_input: unknown, options: { enabled: boolean }) => ({
          data: options.enabled ? page : undefined,
          isSuccess: options.enabled,
          isFetching: false,
          error: null,
          refetch: () => Promise.resolve({}),
        }),
      },
      resumableBatch: { useQuery: () => ({ data: null }) },
      revealBatch: { useQuery: () => ({ data: undefined }) },
    },
  },
}));

const revealProspectsAction = vi.hoisted(() => vi.fn());
vi.mock("../prospectActions", () => ({ revealProspectsAction }));
vi.mock("../prospectApplyActions", () => ({ applyProspectsAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));

import { FindPeopleDialog } from "./FindPeopleDialog";

afterEach(cleanup);

const ORG = "11111111-1111-4111-8111-111111111111";
const noop = (): void => undefined;

function firstChunk(): unknown {
  return {
    ok: true,
    value: {
      items: page.profiles.slice(0, PROSPECT_REVEAL_CHUNK).map((profile) => ({
        providerRef: profile.providerRef,
        profile,
        outcomes: [],
        fields: [
          {
            canonicalKey: "person.email",
            label: "Email",
            values: [{ value: `${profile.providerRef}@example.com`, providers: ["apollo"] }],
            selectedValue: `${profile.providerRef}@example.com`,
            currentValue: null,
            isOverwrite: false,
            currentInvalid: false,
            supportsPrimary: true,
            defaultMakePrimary: true,
            defaultSelected: true,
          },
        ],
        match: { kind: "new" },
      })),
      failures: [],
      mappingsFingerprint: "fp-1",
    },
  };
}

describe("FindPeopleDialog reveal settling", () => {
  it("reaches the review step when a later chunk fails on reveals already paid for", async () => {
    revealProspectsAction
      .mockResolvedValueOnce(firstChunk())
      .mockResolvedValueOnce({ ok: false, error: { id: "E_ENRICH_001" } });
    const user = userEvent.setup();
    render(<FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={noop} />);

    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select everyone on this page" }));
    await user.click(screen.getByRole("button", { name: "Reveal 6 people's details" }));

    expect(await screen.findByText("Review what came back")).toBeInTheDocument();
    expect(screen.getByText("Person 0")).toBeInTheDocument();
    expect(revealProspectsAction).toHaveBeenCalledTimes(2);
  });

  it("stays on the reveal step when the whole reveal came back empty", async () => {
    revealProspectsAction.mockResolvedValue({ ok: false, error: { id: "E_ENRICH_001" } });
    const user = userEvent.setup();
    render(<FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={noop} />);

    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select everyone on this page" }));
    await user.click(screen.getByRole("button", { name: "Reveal 6 people's details" }));

    expect(await screen.findByText(/The reveal stopped early/)).toBeInTheDocument();
    expect(screen.queryByText("Review what came back")).not.toBeInTheDocument();
  });
});
