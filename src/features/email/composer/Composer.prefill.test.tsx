// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveDraftAction } from "../folderActions";
import { DEBOUNCE_MS } from "./useDraftAutosave";
import "./RichTextBody";

afterEach(cleanup);

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
      searchRecipients: { useQuery: () => ({ data: [] }) },
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
    expect(await screen.findByText("draft body")).toBeInTheDocument();
    expect(screen.queryByText("prefill body")).not.toBeInTheDocument();
  });

  it("autosaves through the stubbed server action, never the real one", async () => {
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

      expect(vi.mocked(saveDraftAction).mock.lastCall?.[1]).toMatchObject({
        linkDealId: "deal-9",
        linkPersonId: "person-9",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
