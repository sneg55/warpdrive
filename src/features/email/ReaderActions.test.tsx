// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

vi.mock("./Composer", () => ({
  Composer: (props: {
    threadId?: string;
    prefill?: unknown;
    context?: unknown;
    onClose?: () => void;
  }) => (
    <div data-testid="composer-stub" data-thread-id={props.threadId ?? ""}>
      <pre data-testid="composer-stub-context">{JSON.stringify(props.context ?? null)}</pre>
      <pre data-testid="composer-stub-prefill">{JSON.stringify(props.prefill)}</pre>
      {props.onClose !== undefined && (
        <button type="button" onClick={props.onClose}>
          stub-close
        </button>
      )}
    </div>
  ),
}));

import { ReaderActions } from "./ReaderActions";

afterEach(cleanup);

const message = {
  fromEmail: "ann@acme.com",
  toEmails: ["me@ex.com", "bob@acme.com"],
  ccEmails: ["carol@acme.com"],
  subject: "Proposal",
  bodyHtml: "<p>Hi</p>",
};

function readPrefill(): { to: string[]; cc: string[]; subject: string; bodyHtml: string } {
  const stub = screen.getByTestId("composer-stub-prefill");
  return JSON.parse(stub.textContent ?? "{}");
}

describe("ReaderActions", () => {
  it("passes the record context through to the composer", () => {
    render(
      <ReaderActions
        message={message}
        selfEmail="me@ex.com"
        accountId="acct-1"
        threadId="t1"
        initialMode="reply"
        context={{ kind: "deal", dealId: "d1", personId: "p1" }}
      />,
    );

    expect(JSON.parse(screen.getByTestId("composer-stub-context").textContent ?? "null")).toEqual({
      kind: "deal",
      dealId: "d1",
      personId: "p1",
    });
  });

  it("shows the three action buttons and no composer until one is clicked", () => {
    render(
      <ReaderActions message={message} selfEmail="me@ex.com" accountId="acct-1" threadId="t1" />,
    );
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reply all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forward" })).toBeInTheDocument();
    expect(screen.queryByTestId("composer-stub")).not.toBeInTheDocument();
  });

  it("renders the reply affordance as a bordered footer card with the sender avatar (B10)", () => {
    render(
      <ReaderActions message={message} selfEmail="me@ex.com" accountId="acct-1" threadId="t1" />,
    );
    const footer = screen.getByTestId("reader-reply-footer");
    expect(footer).toHaveClass("border", "rounded-md");
    expect(within(footer).getByRole("img", { name: "ann@acme.com" })).toBeInTheDocument();
  });

  it("clicking Reply opens the composer targeting only the sender, on the same thread", () => {
    render(
      <ReaderActions message={message} selfEmail="me@ex.com" accountId="acct-1" threadId="t1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    const prefill = readPrefill();
    expect(prefill.to).toEqual(["ann@acme.com"]);
    expect(prefill.cc).toEqual([]);
    expect(screen.getByTestId("composer-stub").dataset.threadId).toBe("t1");
  });

  it("clicking Reply all opens the composer with the derived reply-all prefill", () => {
    render(
      <ReaderActions message={message} selfEmail="me@ex.com" accountId="acct-1" threadId="t1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reply all" }));
    const prefill = readPrefill();
    expect(prefill.to).toHaveLength(2);
    expect(prefill.to).toEqual(["ann@acme.com", "bob@acme.com"]);
    expect(prefill.cc).toEqual(["carol@acme.com"]);
    expect(screen.getByTestId("composer-stub").dataset.threadId).toBe("t1");
  });

  it("clicking Forward opens the composer with a blank thread id and a Fwd: subject", () => {
    render(
      <ReaderActions message={message} selfEmail="me@ex.com" accountId="acct-1" threadId="t1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    const prefill = readPrefill();
    expect(prefill.to).toEqual([]);
    expect(prefill.subject).toMatch(/^Fwd:/);
    expect(screen.getByTestId("composer-stub").dataset.threadId).toBe("");
  });

  it("closing the composer returns to the three action buttons; a new mode can then be picked", () => {
    render(
      <ReaderActions message={message} selfEmail="me@ex.com" accountId="acct-1" threadId="t1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reply all" }));
    expect(readPrefill().to).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "stub-close" }));
    expect(screen.queryByTestId("composer-stub")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(readPrefill().to).toEqual([]);
    expect(readPrefill().subject).toMatch(/^Fwd:/);
  });
});
