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
        useQuery: () => ({
          data: [{ id: "type-email-uuid", key: "email", name: "Email" }],
        }),
      },
    },
  },
}));

const sendEmailMock = vi.fn<() => Promise<{ ok: boolean }>>(() => Promise.resolve({ ok: true }));
vi.mock("@/features/email/actions", () => ({
  sendEmail: () => sendEmailMock(),
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

type ActivityInput = {
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
  subject: string;
  typeId: string;
};
type ActivityResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };
const createActivityMock = vi.fn<(input: ActivityInput) => Promise<ActivityResult>>(() =>
  Promise.resolve({ ok: true, value: { id: "act-1" } }),
);
vi.mock("@/features/activities/actions", () => ({
  createActivityAction: (input: ActivityInput) => createActivityMock(input),
  completeActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-1" } }),
}));

import { Composer } from "./Composer";

describe("Composer – add-as-activity toggle (Phase 5)", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockImplementation(() => Promise.resolve({ ok: true }));
    createActivityMock.mockReset();
    createActivityMock.mockImplementation(() =>
      Promise.resolve({ ok: true, value: { id: "act-1" } }),
    );
  });

  it("toggle is present for inbox context (no deal)", () => {
    render(<Composer accountId="a1" />);
    expect(screen.getByRole("checkbox", { name: /add as activity/i })).toBeInTheDocument();
  });

  it("toggle is present for deal context", () => {
    render(
      <Composer accountId="a1" context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }} />,
    );
    expect(screen.getByRole("checkbox", { name: /add as activity/i })).toBeInTheDocument();
  });

  it("with toggle ON, successful send calls createActivityAction with the deal id", async () => {
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "deal-42", defaultTo: "x@x.com" }}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /add as activity/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(createActivityMock).toHaveBeenCalledTimes(1));

    const [inputArg] = createActivityMock.mock.calls[0] as [{ dealId: string; subject: string }];
    expect(inputArg.dealId).toBe("deal-42");
    expect(inputArg.subject).toMatch(/email sent/i);
  });

  it("with toggle ON in inbox context, successful send creates a standalone activity (dealId/personId/orgId null)", async () => {
    render(<Composer accountId="a1" />);

    const input = screen
      .getAllByRole("combobox")
      .find((el) => el.tagName === "INPUT") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.click(screen.getByRole("checkbox", { name: /add as activity/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(createActivityMock).toHaveBeenCalledTimes(1));

    const [inputArg] = createActivityMock.mock.calls[0] as [ActivityInput];
    expect(inputArg.dealId).toBeNull();
    expect(inputArg.personId).toBeNull();
    expect(inputArg.orgId).toBeNull();
  });

  it("with toggle OFF, successful send does NOT call createActivityAction", async () => {
    render(
      <Composer accountId="a1" context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    expect(createActivityMock).not.toHaveBeenCalled();
  });

  it("inbox send never calls createActivityAction", async () => {
    render(<Composer accountId="a1" context={{ kind: "inbox" }} />);
    const input = screen
      .getAllByRole("combobox")
      .find((el) => el.tagName === "INPUT") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    expect(createActivityMock).not.toHaveBeenCalled();
  });

  it("activity-create failure does not surface as send error (onSent still fires)", async () => {
    createActivityMock.mockImplementation(() =>
      Promise.resolve({ ok: false, error: { id: "E_DB_001" } }),
    );

    const onSent = vi.fn();
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }}
        onSent={onSent}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /add as activity/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toggle resets to OFF after Discard", () => {
    render(
      <Composer accountId="a1" context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /add as activity/i }));
    expect(screen.getByRole("checkbox", { name: /add as activity/i })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(screen.getByRole("checkbox", { name: /add as activity/i })).not.toBeChecked();
  });

  it("(item 5) typed subject is forwarded to createActivityAction, not the default fallback", async () => {
    const onSent = vi.fn();
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "deal-77", defaultTo: "x@x.com" }}
        onSent={onSent}
      />,
    );

    const subjectInput = screen.getByPlaceholderText("Subject");
    fireEvent.change(subjectInput, { target: { value: "Q2 Partnership Proposal" } });

    fireEvent.click(screen.getByRole("checkbox", { name: /add as activity/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(createActivityMock).toHaveBeenCalledTimes(1));

    const [inputArg] = createActivityMock.mock.calls[0] as [{ subject: string }];
    expect(inputArg.subject).toBe("Q2 Partnership Proposal");
  });

  it("(item 6) activity-create failure: sendEmail called once AND onSent fires", async () => {
    createActivityMock.mockImplementation(() =>
      Promise.resolve({ ok: false, error: { id: "E_DB_001" } }),
    );

    const onSent = vi.fn();
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }}
        onSent={onSent}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /add as activity/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("(item b) slow createActivity does not delay onSent: onSent fires before activity resolves", async () => {
    let resolveActivity!: (v: ActivityResult) => void;
    createActivityMock.mockImplementation(
      () =>
        new Promise<ActivityResult>((res) => {
          resolveActivity = res;
        }),
    );

    const onSent = vi.fn();
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }}
        onSent={onSent}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /add as activity/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    resolveActivity({ ok: true, value: { id: "act-resolved" } });
  });
});
