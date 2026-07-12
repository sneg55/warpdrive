// @vitest-environment jsdom
// C3 (Pipedrive parity): the preselected default signature is rendered INTO the compose body so it
// is visible and editable (WYSIWYG). Because the signature now lives in the body, send must NOT
// also append it server-side (no double-signature). Split into its own file to keep Composer.test
// under the 300-line hard cap.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// A single default signature whose body is a distinctive string so occurrence-counting is exact.
const SIGNATURE_HTML = "<p>-- Jane Doe, Acme</p>";
const SIGNATURE_TEXT = "-- Jane Doe, Acme";

const signaturesData = [{ id: "s1", name: "Work", isDefault: true, bodyHtml: SIGNATURE_HTML }];

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ email: { templates: { list: { invalidate: () => undefined } } } }),
    email: {
      templates: {
        list: { useQuery: () => ({ data: [] }) },
        get: { useQuery: () => ({ data: undefined }) },
      },
      signatures: { list: { useQuery: () => ({ data: signaturesData }) } },
    },
    contacts: { listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) } },
    activities: { listTypes: { useQuery: () => ({ data: [] }) } },
  },
}));

// Capture the send payload (2nd arg) so we can assert on bodyHtml + signatureId.
const sendEmailMock = vi.fn<(csrf: string, input: unknown) => Promise<{ ok: boolean }>>(() =>
  Promise.resolve({ ok: true }),
);
vi.mock("@/features/email/actions", () => ({
  sendEmail: (csrf: string, input: unknown) => sendEmailMock(csrf, input),
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

// Resuming a draft mounts useDraftAutosave, which calls these server actions; stub them so the test
// never hits a real server action (which reads request headers outside a request scope).
vi.mock("../folderActions", () => ({
  saveDraftAction: () => Promise.resolve({ ok: true, value: { id: "dr1" } }),
  deleteDraftAction: () => Promise.resolve({ ok: true }),
}));

vi.mock("@/features/activities/actions", () => ({
  createActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-stub" } }),
  completeActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-stub" } }),
}));

vi.mock("@/features/files/serverActions", () => ({
  requestUploadAction: () =>
    Promise.resolve({
      ok: true,
      value: { fileId: "f1", post: { url: "https://fake/up", fields: {} } },
    }),
  confirmUploadAction: () => Promise.resolve({ ok: true }),
}));

vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 204 })));

import { Composer } from "./Composer";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("Composer signature-in-body (C3)", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockImplementation(() => Promise.resolve({ ok: true }));
  });

  it("renders the default signature into the compose body on open (visible)", async () => {
    render(
      <Composer accountId="a1" context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }} />,
    );
    // The editor loads via next/dynamic and seeds the body with the default signature markup.
    expect(await screen.findByText(SIGNATURE_TEXT)).toBeInTheDocument();
  });

  it("sends the default signature on a non-empty prefill (forward/reply) via signatureId, not embedded", async () => {
    // A forwarded/quoted message opens the composer with a non-empty body, so the signature is NOT
    // embedded (embedding into the quote would be wrong). It must still reach the recipient: send
    // passes the real signatureId so the server appends it (regression: U7 hardcoded "" and dropped
    // the signature from every forward/reply, codex P2).
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }}
        prefill={{ bodyHtml: "<p>On Mon, someone wrote: original message</p>" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    const input = sendEmailMock.mock.calls[0]![1] as { bodyHtml: string; signatureId?: string };
    // Not embedded in the body (no double-signature)...
    expect(countOccurrences(input.bodyHtml, SIGNATURE_TEXT)).toBe(0);
    // ...so the selected signature id is passed for the server to append.
    expect(input.signatureId).toBe("s1");
  });

  it("does not re-append the signature when resuming a draft whose body already contains it", async () => {
    // A fresh compose embeds the signature into the body, which autosave persists. On resume the
    // body is authoritative (already has the signature), so send must NOT also ask the server to
    // append it, or the recipient gets it twice (codex P2 draft-resume).
    const draftBody = `<p>Half-written reply</p>${SIGNATURE_HTML}`;
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }}
        draft={{ id: "dr1", subject: "S", bodyHtml: draftBody, to: ["x@x.com"], cc: [] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    const input = sendEmailMock.mock.calls[0]![1] as { bodyHtml: string; signatureId?: string };
    expect(input.signatureId).toBeUndefined();
    expect(countOccurrences(input.bodyHtml, SIGNATURE_TEXT)).toBe(1);
  });

  it("does not duplicate the signature at send (it is already in the body)", async () => {
    render(
      <Composer accountId="a1" context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }} />,
    );
    // Wait for the editor to seed the signature into the body before sending.
    await screen.findByText(SIGNATURE_TEXT);

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    const input = sendEmailMock.mock.calls[0]![1] as { bodyHtml: string; signatureId?: string };
    // The signature appears exactly once in the sent body...
    expect(countOccurrences(input.bodyHtml, SIGNATURE_TEXT)).toBe(1);
    // ...and no signatureId is passed, so the server does not append it a second time.
    expect(input.signatureId).toBeUndefined();
  });
});
