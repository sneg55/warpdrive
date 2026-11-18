// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

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
      mergeContext: { useQuery: () => ({ data: {}, isPending: false }) },
      signatures: { list: { useQuery: () => ({ data: signaturesData }) } },
    },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
      searchRecipients: { useQuery: () => ({ data: [] }) },
    },
    activities: { listTypes: { useQuery: () => ({ data: [] }) } },
  },
}));

const sendEmailMock = vi.fn<(csrf: string, input: unknown) => Promise<{ ok: boolean }>>(() =>
  Promise.resolve({ ok: true }),
);
vi.mock("@/features/email/actions", () => ({
  sendEmail: (csrf: string, input: unknown) => sendEmailMock(csrf, input),
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

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
    expect(await screen.findByText(SIGNATURE_TEXT)).toBeInTheDocument();
  });

  it("sends the default signature on a non-empty prefill (forward/reply) via signatureId, not embedded", async () => {
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
    expect(countOccurrences(input.bodyHtml, SIGNATURE_TEXT)).toBe(0);
    expect(input.signatureId).toBe("s1");
  });

  it("does not re-append the signature when resuming a draft whose body already contains it", async () => {
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
    await screen.findByText(SIGNATURE_TEXT);

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    const input = sendEmailMock.mock.calls[0]![1] as { bodyHtml: string; signatureId?: string };
    expect(countOccurrences(input.bodyHtml, SIGNATURE_TEXT)).toBe(1);
    expect(input.signatureId).toBeUndefined();
  });
});
