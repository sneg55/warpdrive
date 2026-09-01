// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const page = vi.hoisted(() => ({
  profiles: [
    {
      providerRef: "p0",
      fullName: "Ada Lovelace",
      hasEmail: true,
      hasPhone: false,
      match: { kind: "new" },
    },
    {
      providerRef: "p1",
      fullName: "Grace Hopper",
      hasEmail: true,
      hasPhone: false,
      match: { kind: "new" },
    },
  ],
  hasMore: false,
  outcome: { provider: "apollo", kind: "ok" },
}));

const invalidatePeople = vi.hoisted(() => vi.fn());
const invalidateTimeline = vi.hoisted(() => vi.fn());
const invalidateList = vi.hoisted(() => vi.fn());
const invalidateResumable = vi.hoisted(() => vi.fn());
const invalidateSearch = vi.hoisted(() => vi.fn());
const invalidateBatch = vi.hoisted(() => vi.fn());
const invalidateOptions = vi.hoisted(() => vi.fn());
const routerRefresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      enrichment: {
        resumableBatch: { invalidate: invalidateResumable },
        searchPeople: { invalidate: invalidateSearch },
        revealBatch: { invalidate: invalidateBatch },
      },
      contacts: {
        listPeopleForOrg: { invalidate: invalidatePeople },
        contactTimeline: { invalidate: invalidateTimeline },
        listPeople: { invalidate: invalidateList },
        personOptions: { invalidate: invalidateOptions },
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefresh }) }));

const revealProspectsAction = vi.hoisted(() => vi.fn());
const applyProspectsAction = vi.hoisted(() => vi.fn());
vi.mock("../prospectActions", () => ({ revealProspectsAction }));
vi.mock("../prospectApplyActions", () => ({ applyProspectsAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));

import { FindPeopleDialog } from "./FindPeopleDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ORG = "11111111-1111-4111-8111-111111111111";

function revealed(): unknown {
  return {
    ok: true,
    value: {
      items: page.profiles.map((profile) => ({
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

async function reachReview(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByRole("checkbox", { name: "Select everyone on this page" }));
  await user.click(screen.getByRole("button", { name: "Reveal 2 people's details" }));
  expect(await screen.findByText("Review what came back")).toBeInTheDocument();
}
describe("FindPeopleDialog apply aftermath", () => {
  it("does not close a reopened dialog when an abandoned apply finally answers", async () => {
    revealProspectsAction.mockResolvedValue(revealed());
    let settle: (value: unknown) => void = () => undefined;
    applyProspectsAction.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={onOpenChange} />,
    );

    await reachReview(user);
    await user.click(screen.getByRole("button", { name: "Add 2 people" }));
    view.unmount();

    settle({
      ok: true,
      value: page.profiles.map((profile) => ({
        providerRef: profile.providerRef,
        result: { ok: true, personId: profile.providerRef, appliedFields: ["person.email"] },
      })),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("drops the batch and search caches, so reopening cannot offer work already applied", async () => {
    revealProspectsAction.mockResolvedValue(revealed());
    applyProspectsAction.mockResolvedValue({
      ok: true,
      value: page.profiles.map((profile) => ({
        providerRef: profile.providerRef,
        result: { ok: true, personId: profile.providerRef, appliedFields: ["person.email"] },
      })),
    });
    const user = userEvent.setup();
    render(<FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={vi.fn()} />);

    await reachReview(user);
    await user.click(screen.getByRole("button", { name: "Add 2 people" }));

    expect(invalidateResumable).toHaveBeenCalled();
    expect(invalidateBatch).toHaveBeenCalled();
  });

  it("marks the people search stale without re-running a paid provider call", async () => {
    revealProspectsAction.mockResolvedValue(revealed());
    applyProspectsAction.mockResolvedValue({
      ok: true,
      value: page.profiles.map((profile) => ({
        providerRef: profile.providerRef,
        result: { ok: true, personId: profile.providerRef, appliedFields: ["person.email"] },
      })),
    });
    const user = userEvent.setup();
    render(<FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={vi.fn()} />);

    await reachReview(user);
    await user.click(screen.getByRole("button", { name: "Add 2 people" }));

    expect(invalidateSearch).toHaveBeenCalledWith(undefined, { refetchType: "none" });
  });

  it("refreshes the people of every organization, since an apply can relink one", async () => {
    revealProspectsAction.mockResolvedValue(revealed());
    applyProspectsAction.mockResolvedValue({
      ok: true,
      value: page.profiles.map((profile) => ({
        providerRef: profile.providerRef,
        result: { ok: true, personId: profile.providerRef, appliedFields: ["person.email"] },
      })),
    });
    const user = userEvent.setup();
    render(<FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={vi.fn()} />);

    await reachReview(user);
    await user.click(screen.getByRole("button", { name: "Add 2 people" }));

    expect(invalidatePeople).toHaveBeenCalledWith();
  });

  it("leaves a reopened dialog alone when the apply it abandoned finally answers", async () => {
    revealProspectsAction.mockResolvedValue(revealed());
    let settle: (value: unknown) => void = () => undefined;
    applyProspectsAction.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={onOpenChange} />,
    );

    await reachReview(user);
    await user.click(screen.getByRole("button", { name: "Add 2 people" }));
    view.rerender(
      <FindPeopleDialog orgId={ORG} orgName="Acme" open={false} onOpenChange={onOpenChange} />,
    );
    view.rerender(<FindPeopleDialog orgId={ORG} orgName="Acme" open onOpenChange={onOpenChange} />);

    settle({
      ok: true,
      value: page.profiles.map((profile) => ({
        providerRef: profile.providerRef,
        result: { ok: true, personId: profile.providerRef, appliedFields: ["person.email"] },
      })),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
