// @vitest-environment jsdom
// Reader Reply/Reply-all/Forward prefill: `prefill` seeds initial state when there is no
// `draft`; `draft` (a resumed autosave) always wins over `prefill`. Split into its own file
// (rather than added to Composer.test.tsx) to keep that file under the 300-line hard limit.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveDraftAction } from "../folderActions";
import { DEBOUNCE_MS } from "./useDraftAutosave";
// TipTap sits behind next/dynamic in RichTextBodyLazy and is the heaviest client dependency here.
// Imported for its transform cost, so waiting on the editor's content is not also waiting on the
// module to load. Unused by name on purpose.
import "./RichTextBody";

afterEach(cleanup);

// Same mock set as Composer.test.tsx: Composer imports trpc/actions/csrfCookie/files
// unconditionally, so every file that mounts the real Composer needs these stubs.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ email: { templates: { list: { invalidate: () => undefined } } } }),
    email: {
      templates: {
        list: { useQuery: () => ({ data: [] }) },
        get: { useQuery: () => ({ data: undefined }) },
      },
      mergeContext: { useQuery: () => ({ data: {}, isPending: false }) },
      signatures: { list: { useQuery: () => ({ data: [] }) } },
    },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
    },
    activities: {
      listTypes: { useQuery: () => ({ data: [] }) },
    },
  },
}));

vi.mock("@/features/email/actions", () => ({
  sendEmail: () => Promise.resolve({ ok: true }),
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

// Mounting the Composer arms useDraftAutosave's debounce, so these must be stubbed even though no
// test here drives a save: the timer calls them for real otherwise. Same stub as
// Composer.signature.test.tsx.
vi.mock("../folderActions", () => ({
  saveDraftAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "draft-stub" } })),
  deleteDraftAction: vi.fn(() => Promise.resolve({ ok: true })),
}));

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

import { Composer } from "./Composer";

describe("Composer – prefill from reader Reply/Reply all/Forward", () => {
  it("with prefill only: seeds to/subject/body from prefill", async () => {
    render(
      <Composer
        accountId="a1"
        context={{ kind: "inbox" }}
        prefill={{
          to: ["ann@acme.com"],
          cc: [],
          subject: "Re: Proposal",
          bodyHtml: "<p>quoted reply body</p>",
        }}
      />,
    );

    expect(screen.getByText("ann@acme.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Subject")).toHaveValue("Re: Proposal");
    // RichTextBody renders the seeded html into the editable region. It is loaded via
    // next/dynamic, so it lands a tick after the surrounding composer chrome.
    expect(await screen.findByText("quoted reply body")).toBeInTheDocument();
  });

  it("with both draft and prefill: draft wins (locks the draft ?? prefill ?? default precedence)", async () => {
    render(
      <Composer
        accountId="a1"
        context={{ kind: "inbox" }}
        draft={{
          id: "draft-1",
          subject: "Draft subject",
          bodyHtml: "<p>draft body</p>",
          to: ["draft@x.com"],
          cc: [],
        }}
        prefill={{
          to: ["prefill@x.com"],
          cc: [],
          subject: "Prefill subject",
          bodyHtml: "<p>prefill body</p>",
        }}
      />,
    );

    expect(screen.getByText("draft@x.com")).toBeInTheDocument();
    expect(screen.queryByText("prefill@x.com")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Subject")).toHaveValue("Draft subject");
    // The editor arrives via next/dynamic, one tick after the composer chrome.
    expect(await screen.findByText("draft body")).toBeInTheDocument();
    expect(screen.queryByText("prefill body")).not.toBeInTheDocument();
  });

  // Mounting the Composer arms useDraftAutosave's 1500ms debounce. When a test finishes and
  // unmounts inside that window the timer is cleared and nothing happens, which is why this file
  // looked fine; on a loaded CI worker the window is missed and the timer fires the REAL
  // saveDraftAction, which calls headers() with no Next request store and kills the whole file
  // with E251. This asserts the save is routed through the stub instead.
  it("autosaves through the stubbed server action, never the real one", async () => {
    // Fake timers, not a waitFor budget: waiting out a real 1500ms debounce makes the assertion a
    // race against however loaded the machine is, which is the same flakiness this test exists to
    // remove. Here the clock is driven, so the result does not depend on wall time at all.
    vi.useFakeTimers();
    try {
      render(
        <Composer
          accountId="a1"
          context={{ kind: "inbox" }}
          prefill={{
            to: ["ann@acme.com"],
            cc: [],
            subject: "Re: Proposal",
            bodyHtml: "<p>quoted reply body</p>",
          }}
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
      });

      expect(vi.mocked(saveDraftAction)).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // A draft resumed in the plain inbox composer must keep the deal it was written against: the
  // link lives only on the draft row there, so dropping it would silently send an unlinked email.
  it("keeps a resumed draft's CRM links on the next autosave", async () => {
    vi.useFakeTimers();
    try {
      render(
        <Composer
          accountId="a1"
          context={{ kind: "inbox" }}
          draft={{
            id: "draft-1",
            subject: "Draft subject",
            bodyHtml: "<p>draft body</p>",
            to: ["draft@x.com"],
            cc: [],
            linkDealId: "deal-9",
            linkPersonId: "person-9",
          }}
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
      });

      // lastCall, not calls[0]: the mock is shared across this file's tests and never cleared.
      expect(vi.mocked(saveDraftAction).mock.lastCall?.[1]).toMatchObject({
        linkDealId: "deal-9",
        linkPersonId: "person-9",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
