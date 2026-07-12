// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  draftsListQuery.mockReturnValue({ data: [] });
});

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// Realtime is a fire-and-forget websocket subscription; mock it so jsdom does not open a socket,
// and so the test can assert compose keeps the inbox subscription alive with the actor id.
const inboxRealtime = vi.fn();
vi.mock("@/features/email/useInboxRealtime", () => ({
  useInboxRealtime: (arg: { selfActorId: string }) => inboxRealtime(arg),
}));

// drafts.list is mocked via a controllable vi.fn (vi.hoisted so it exists before the
// vi.mock factory below runs) so each test can simulate the query being pending
// (data: undefined), resolved (data: DraftSummary[]), or errored (isError: true, data still
// undefined), matching real @tanstack/react-query semantics for `data`/`isError` before and
// after the fetch settles.
const { draftsListQuery } = vi.hoisted(() => ({
  draftsListQuery: vi.fn((): { data: unknown[] | undefined; isError?: boolean } => ({
    data: [],
  })),
}));

// Mock trpc queries: no templates/signatures/contacts/drafts, matching the empty-state harness
// used by Composer.test.tsx (this component renders Composer directly, so it needs the same
// dependency surface), plus drafts.list for the by-id resume seed.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ email: { templates: { list: { invalidate: () => undefined } } } }),
    email: {
      templates: {
        list: { useQuery: () => ({ data: [] }) },
        get: { useQuery: () => ({ data: undefined }) },
      },
      signatures: { list: { useQuery: () => ({ data: [] }) } },
      drafts: { list: { useQuery: draftsListQuery } },
    },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
    },
    activities: {
      listTypes: { useQuery: () => ({ data: [] }) },
    },
    // ComposeLinkSidebar (right column) needs these: pipeline.list for AddDealModal's pipeline
    // picker, search.query for LinkExistingCombobox's deal search.
    pipeline: {
      list: { useQuery: () => ({ data: [] }) },
    },
    search: {
      query: { useQuery: () => ({ data: undefined }) },
    },
  },
}));

vi.mock("@/features/email/actions", () => ({
  sendEmail: () => Promise.resolve({ ok: true }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/activities/actions", () => ({
  createActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-stub" } }),
  completeActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-stub" } }),
}));
vi.mock("@/features/files/serverActions", () => ({
  requestUploadAction: () =>
    Promise.resolve({
      ok: true,
      value: { fileId: "attach-file-1", post: { url: "https://fake/up", fields: {} } },
    }),
  confirmUploadAction: () => Promise.resolve({ ok: true }),
}));
vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 204 })));

import { ComposePageClient } from "./ComposePageClient";

describe("ComposePageClient", () => {
  it("renders the compose pane for the given mailbox", () => {
    render(
      <ComposePageClient
        accountId="acct-1"
        fromAddress="sender@example.com"
        selfActorId="actor-1"
      />,
    );
    expect(screen.getByRole("region", { name: "compose email" })).toBeInTheDocument();
  });

  it("keeps the inbox realtime subscription alive while composing", () => {
    render(
      <ComposePageClient
        accountId="acct-1"
        fromAddress="sender@example.com"
        selfActorId="actor-1"
      />,
    );
    expect(inboxRealtime).toHaveBeenCalledWith({ selfActorId: "actor-1" });
  });

  it("does not fetch drafts.list on a plain compose (no draftId), fetches it on resume", () => {
    render(
      <ComposePageClient
        accountId="acct-1"
        fromAddress="sender@example.com"
        selfActorId="actor-1"
      />,
    );
    expect(draftsListQuery).toHaveBeenCalledWith(undefined, { enabled: false });

    draftsListQuery.mockClear();
    render(
      <ComposePageClient
        accountId="acct-1"
        fromAddress="sender@example.com"
        selfActorId="actor-1"
        draftId="draft-1"
      />,
    );
    expect(draftsListQuery).toHaveBeenCalledWith(undefined, { enabled: true });
  });

  it("renders a Back control linking to /inbox", () => {
    render(
      <ComposePageClient
        accountId="acct-1"
        fromAddress="sender@example.com"
        selfActorId="actor-1"
      />,
    );
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/inbox");
  });

  it("with no draftId: mounts the composer immediately even while drafts.list is still pending", () => {
    draftsListQuery.mockReturnValue({ data: undefined });
    render(
      <ComposePageClient
        accountId="acct-1"
        fromAddress="sender@example.com"
        selfActorId="actor-1"
      />,
    );
    expect(screen.getByRole("region", { name: "compose email" })).toBeInTheDocument();
  });

  it("with a draftId: does NOT mount the composer while drafts.list is pending (avoids a blank composer the query then wipes on remount)", () => {
    draftsListQuery.mockReturnValue({ data: undefined });
    render(
      <ComposePageClient
        accountId="acct-1"
        fromAddress="sender@example.com"
        selfActorId="actor-1"
        draftId="draft-1"
      />,
    );
    expect(screen.queryByRole("region", { name: "compose email" })).not.toBeInTheDocument();
    expect(screen.getByText("Loading draft...")).toBeInTheDocument();
  });

  it("with a draftId: mounts a fresh composer instead of waiting forever when drafts.list errors", () => {
    draftsListQuery.mockReturnValue({ data: undefined, isError: true });
    render(
      <ComposePageClient
        accountId="acct-1"
        fromAddress="sender@example.com"
        selfActorId="actor-1"
        draftId="draft-1"
      />,
    );
    expect(screen.getByRole("region", { name: "compose email" })).toBeInTheDocument();
    expect(screen.queryByText("Loading draft...")).not.toBeInTheDocument();
  });

  it("with a draftId: mounts the composer seeded once drafts.list resolves with the matching draft", () => {
    draftsListQuery.mockReturnValue({
      data: [
        {
          id: "draft-1",
          subject: "Resumed subject",
          bodyHtml: "<p>resumed body</p>",
          toEmails: ["resume@x.com"],
          ccEmails: [],
          threadId: null,
          accountId: "acct-1",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    render(
      <ComposePageClient
        accountId="acct-1"
        fromAddress="sender@example.com"
        selfActorId="actor-1"
        draftId="draft-1"
      />,
    );
    expect(screen.getByRole("region", { name: "compose email" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Subject")).toHaveValue("Resumed subject");
    expect(screen.queryByText("Loading draft...")).not.toBeInTheDocument();
  });
});
