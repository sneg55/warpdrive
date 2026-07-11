// @vitest-environment jsdom
// Reader Reply/Reply-all/Forward prefill: `prefill` seeds initial state when there is no
// `draft`; `draft` (a resumed autosave) always wins over `prefill`. Split into its own file
// (rather than added to Composer.test.tsx) to keep that file under the 300-line hard limit.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
});
