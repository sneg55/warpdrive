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
      listTypes: {
        useQuery: () => ({ data: [{ id: "type-email-uuid", key: "email", name: "Email" }] }),
      },
    },
  },
}));

const sendEmailMock = vi.fn<() => Promise<{ ok: boolean }>>(() => Promise.resolve({ ok: true }));
vi.mock("@/features/email/actions", () => ({
  sendEmail: () => sendEmailMock(),
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

type ActivityInput = { dealId: string; subject: string };
type ActivityResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };
const createActivityMock = vi.fn<(input: ActivityInput) => Promise<ActivityResult>>(() =>
  Promise.resolve({ ok: true, value: { id: "act-s" } }),
);
vi.mock("@/features/activities/actions", () => ({
  createActivityAction: (input: ActivityInput) => createActivityMock(input),
  completeActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-s" } }),
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

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

describe("Composer scheduled send", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockImplementation(() => Promise.resolve({ ok: true }));
    createActivityMock.mockReset();
    createActivityMock.mockImplementation(() =>
      Promise.resolve({ ok: true, value: { id: "act-s" } }),
    );
  });

  it("Send later button is enabled when there is a recipient (onSendLater wired from Composer)", () => {
    render(
      <Composer
        accountId="acct-1"
        context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }}
      />,
    );
    const laterBtn = screen.getByRole("button", { name: /send later/i });
    expect(laterBtn).not.toBeDisabled();
  });
});

describe("Composer scheduled send: activity creation (fix #3)", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockImplementation(() => Promise.resolve({ ok: true }));
    createActivityMock.mockReset();
    createActivityMock.mockImplementation(() =>
      Promise.resolve({ ok: true, value: { id: "act-s" } }),
    );
  });

  it("Send later + toggle ON creates the activity in deal context", async () => {
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "deal-99", defaultTo: "x@x.com" }}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /add as activity/i }));
    fireEvent.click(screen.getByRole("button", { name: /send later/i }));
    const picker = await screen.findByTestId("scheduled-at-picker");
    fireEvent.change(picker, { target: { value: toLocalInput(new Date(Date.now() + 3_600_000)) } });
    fireEvent.click(screen.getByRole("button", { name: /^schedule$/i }));

    await waitFor(() => expect(createActivityMock).toHaveBeenCalledTimes(1));
    const [arg] = createActivityMock.mock.calls[0] as [ActivityInput];
    expect(arg.dealId).toBe("deal-99");
  });

  it("Send later + toggle OFF does NOT create the activity", async () => {
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "deal-88", defaultTo: "x@x.com" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /send later/i }));
    const picker = await screen.findByTestId("scheduled-at-picker");
    fireEvent.change(picker, { target: { value: toLocalInput(new Date(Date.now() + 3_600_000)) } });
    fireEvent.click(screen.getByRole("button", { name: /^schedule$/i }));

    await waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    expect(createActivityMock).not.toHaveBeenCalled();
  });
});
