// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailCardMenu } from "./EmailCardMenu";

afterEach(cleanup);

function noop(): void {}

describe("EmailCardMenu", () => {
  it("offers reply all, forward, open in inbox and unlink to the mailbox owner", async () => {
    render(
      <EmailCardMenu
        threadId="t1"
        canCompose
        onReplyAll={noop}
        onForward={noop}
        onUnlink={noop}
        unlinkLabel="Unlink from deal"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));

    expect(screen.getByRole("menuitem", { name: "Reply all" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Forward" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open in Inbox" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Unlink from deal" })).toBeInTheDocument();
  });

  it("offers only open in inbox when the actor does not own the mailbox", async () => {
    render(
      <EmailCardMenu
        threadId="t1"
        canCompose={false}
        onReplyAll={noop}
        onForward={noop}
        onUnlink={noop}
        unlinkLabel="Unlink from deal"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));

    expect(screen.getByRole("menuitem", { name: "Open in Inbox" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Reply all" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Forward" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /unlink/i })).not.toBeInTheDocument();
  });

  it("links open-in-inbox to the thread route", async () => {
    render(
      <EmailCardMenu
        threadId="t-42"
        canCompose
        onReplyAll={noop}
        onForward={noop}
        onUnlink={noop}
        unlinkLabel="Unlink from deal"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));

    // Radix merges the item onto the anchor (asChild), so the menuitem IS the link element.
    expect(screen.getByRole("menuitem", { name: "Open in Inbox" })).toHaveAttribute(
      "href",
      "/inbox/t-42",
    );
  });

  it("confirms before unlinking and only fires on the affirmative", async () => {
    const onUnlink = vi.fn();
    render(
      <EmailCardMenu
        threadId="t1"
        canCompose
        onReplyAll={noop}
        onForward={noop}
        onUnlink={onUnlink}
        unlinkLabel="Unlink from deal"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Unlink from deal" }));

    expect(onUnlink).not.toHaveBeenCalled();
    expect(screen.getByText(/Unlink this conversation\?/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));

    expect(onUnlink).toHaveBeenCalledTimes(1);
  });

  it("fires reply all and forward from their items", async () => {
    const onReplyAll = vi.fn();
    const onForward = vi.fn();
    render(
      <EmailCardMenu
        threadId="t1"
        canCompose
        onReplyAll={onReplyAll}
        onForward={onForward}
        onUnlink={noop}
        unlinkLabel="Unlink from deal"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Reply all" }));
    expect(onReplyAll).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Forward" }));
    expect(onForward).toHaveBeenCalledTimes(1);
  });
});
