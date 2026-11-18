// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

vi.mock("@/features/activities/actions", () => ({
  createActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-stub" } }),
  completeActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-stub" } }),
}));

const sendEmailSpy = vi.fn<(csrf: unknown, rawInput: unknown) => Promise<{ ok: boolean }>>(() =>
  Promise.resolve({ ok: true }),
);
vi.mock("@/features/email/actions", () => ({
  sendEmail: (csrf: unknown, rawInput: unknown) => sendEmailSpy(csrf, rawInput),
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

describe("Composer – attachments wired (Task 6.3)", () => {
  beforeEach(() => {
    sendEmailSpy.mockClear();
    sendEmailSpy.mockImplementation(() => Promise.resolve({ ok: true }));
  });

  it("includes confirmed attachment fileIds in the sendEmail call", async () => {
    render(
      <Composer accountId="a1" context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }} />,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(["pdf"], "test.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => expect(screen.getByText("test.pdf")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(sendEmailSpy).toHaveBeenCalledTimes(1));

    const rawInput = sendEmailSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(rawInput).toBeDefined();
    expect(rawInput.attachments).toEqual([{ fileId: "attach-file-1" }]);
  });

  it("Send is disabled while an upload is in progress and re-enabled once confirmed", async () => {
    let resolveFetch!: () => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = () => resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", () => fetchPromise);

    render(
      <Composer accountId="a1" context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }} />,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["pdf"], "inflight.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled());

    resolveFetch();

    await waitFor(() => expect(screen.getByText("inflight.pdf")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^send$/i })).not.toBeDisabled();

    vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 204 })));
  });

  it("clears attachments after resetDraft (Discard)", async () => {
    render(
      <Composer accountId="a1" context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }} />,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["pdf"], "draft.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(screen.getByText("draft.pdf")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(screen.queryByText("draft.pdf")).not.toBeInTheDocument();
  });
});
