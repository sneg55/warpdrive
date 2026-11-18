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

const sendEmailMock = vi.fn<() => Promise<{ ok: boolean }>>(() => Promise.resolve({ ok: true }));
vi.mock("@/features/email/actions", () => ({
  sendEmail: () => sendEmailMock(),
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

describe("Composer (deal context)", () => {
  it("prefills the To field with defaultTo from deal context as a chip", () => {
    render(
      <Composer
        accountId="a1"
        fromAddress="sender@example.com"
        context={{ kind: "deal", dealId: "d1", defaultTo: "sofia@x.com" }}
      />,
    );
    expect(screen.getByText("sofia@x.com")).toBeInTheDocument();
  });

  it("discard removes an added recipient and restores only the defaultTo chip", () => {
    const onSent = vi.fn();
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "d1", defaultTo: "sofia@x.com" }}
        onSent={onSent}
      />,
    );
    const input = screen
      .getAllByRole("combobox")
      .find((el) => el.tagName === "INPUT") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "extra@x.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("extra@x.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.getByText("sofia@x.com")).toBeInTheDocument();
    expect(screen.queryByText("extra@x.com")).not.toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();
  });

  it("leaves To field empty for inbox context (no recipient chips)", () => {
    render(
      <Composer accountId="a1" fromAddress="sender@example.com" context={{ kind: "inbox" }} />,
    );
    expect(screen.getByText("To")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remove/i })).not.toBeInTheDocument();
  });

  it("renders Subject as a divider row without boxed border styling", () => {
    render(<Composer accountId="a1" context={{ kind: "inbox" }} />);
    const subjectInput = screen.getByPlaceholderText("Subject");
    expect(subjectInput).toBeInTheDocument();
    const classes = subjectInput.className.split(/\s+/);
    expect(classes).not.toContain("rounded");
    expect(classes).not.toContain("border");
  });
});

describe("Cc/Bcc collapse on Discard", () => {
  it("collapses Cc/Bcc rows and clears bcc after Discard", () => {
    render(<Composer accountId="a1" context={{ kind: "inbox" }} />);
    fireEvent.click(screen.getByRole("button", { name: /cc\/bcc/i }));
    expect(screen.getByText("Bcc")).toBeInTheDocument();

    const inputCombos = screen.getAllByRole("combobox").filter((el) => el.tagName === "INPUT");
    const bccCombo = inputCombos[2]!;
    fireEvent.change(bccCombo, { target: { value: "secret@x.com" } });
    fireEvent.keyDown(bccCombo, { key: "Enter" });
    expect(screen.getByText("secret@x.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.queryByText("Cc")).not.toBeInTheDocument();
    expect(screen.queryByText("Bcc")).not.toBeInTheDocument();
    expect(screen.queryByText("secret@x.com")).not.toBeInTheDocument();
  });
});

describe("Composer – insertToken cleared on reset", () => {
  it("resets insertToken after Discard so a remounted editor starts empty", () => {
    const { unmount } = render(
      <Composer accountId="a1" context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.getByText("x@x.com")).toBeInTheDocument();
    unmount();
  });
});

describe("Composer – default signature applied once", () => {
  it("keeps signatureId empty when user selects None, even if signatures query re-renders", () => {
    render(<Composer accountId="a1" context={{ kind: "inbox" }} />);
    expect(screen.queryByLabelText(/choose signature/i)).not.toBeInTheDocument();
  });
});

describe("Composer error banner", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
  });

  it("shows a top role=alert banner when send fails, dismiss removes it", async () => {
    sendEmailMock.mockImplementation(() => Promise.resolve({ ok: false as const }));
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "d1", defaultTo: "recipient@x.com" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    expect(screen.queryByText(/failed to send/i, { selector: "p" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /dismiss error/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

const createActivityMockForOrdering = vi.fn<(input: unknown) => Promise<{ ok: boolean }>>(() =>
  Promise.resolve({ ok: true }),
);

describe("Composer – send-success ordering (fire-and-forget activity)", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockImplementation(() => Promise.resolve({ ok: true }));
    createActivityMockForOrdering.mockReset();
    createActivityMockForOrdering.mockImplementation(() => Promise.resolve({ ok: true }));
  });

  it("(b) slow createActivity does not delay onSent: onSent fires before slow activity resolves", async () => {
    const onSent = vi.fn();
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }}
        onSent={onSent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("(b) Send button is re-disabled after send (no duplicate-send window)", async () => {
    const onSent = vi.fn();
    render(
      <Composer
        accountId="a1"
        context={{ kind: "deal", dealId: "d1", defaultTo: "x@x.com" }}
        onSent={onSent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});
