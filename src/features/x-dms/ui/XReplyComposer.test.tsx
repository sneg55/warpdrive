// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { ActionResult } from "@/types/actionResult";

const state = vi.hoisted(() => ({
  send: vi.fn<(raw: unknown, csrf: string | null) => Promise<unknown>>(),
  invalidate: vi.fn(),
  stale: vi.fn<(e: unknown) => boolean>(() => false),
}));

vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: (e: unknown) => state.stale(e),
}));

vi.mock("../actions", () => ({ sendXReplyAction: state.send }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("./XTemplatePicker", () => ({
  XTemplatePicker: ({ onInsert }: { onInsert: (text: string) => void }) => (
    <button type="button" onClick={() => onInsert("Template body")}>
      stub-template
    </button>
  ),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      xDms: {
        list: { invalidate: state.invalidate },
        conversation: { invalidate: state.invalidate },
        unreadCount: { invalidate: state.invalidate },
        accounts: { invalidate: state.invalidate },
      },
    }),
  },
}));

import { XReplyComposer } from "./XReplyComposer";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const resolveWith = (r: ActionResult<{ messageId: string }>) => state.send.mockResolvedValueOnce(r);

function setup() {
  const user = userEvent.setup();
  render(<XReplyComposer conversationId="c1" participantName="Ada Lovelace" />);
  return { user, box: screen.getByRole("textbox", { name: "Reply" }) };
}

it("composer keeps text and shows the error id on failure", async () => {
  resolveWith({
    ok: false,
    error: { id: "E_X_006", detail: "You cannot send messages to this user." },
  });
  const { user, box } = setup();
  await user.type(box, "Hello Ada");
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(state.send).toHaveBeenCalledWith({ conversationId: "c1", text: "Hello Ada" }, "csrf");
  expect(await screen.findByText(/E_X_006/)).toBeInTheDocument();
  expect(screen.getByText(/You cannot send messages to this user\./)).toBeInTheDocument();
  expect(box).toHaveValue("Hello Ada");
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("rate-limited send shows the reply limit message with the reset time", async () => {
  const resetAtMs = Date.UTC(2026, 10, 13, 15, 45, 0);
  resolveWith({ ok: false, error: { id: "E_X_004", resetAtMs } });
  const { user, box } = setup();
  await user.type(box, "Hello");
  await user.click(screen.getByRole("button", { name: "Send" }));
  const time = new Date(resetAtMs).toLocaleTimeString();
  expect(
    await screen.findByText(`This X account hit its reply limit. Try again after ${time}.`),
  ).toBeInTheDocument();
  expect(screen.getByText(/E_X_004/)).toBeInTheDocument();
  expect(box).toHaveValue("Hello");
});

it.each([
  [
    { id: "E_X_012" },
    "This reply may have been sent. Check the conversation after the next sync before sending it again.",
  ],
  [{ id: "E_X_010" }, "This X account must be reconnected by an admin before replies can be sent."],
  [{ id: "E_X_006", detail: "" }, "The reply was not sent."],
  [{ id: "E_X_004" }, "This X account hit its reply limit. Try again in a few minutes."],
])("a %o failure shows its copy and id and keeps the text", async (error, copy) => {
  resolveWith({ ok: false, error });
  const { user, box } = setup();
  await user.type(box, "Keep me");
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText(copy)).toBeInTheDocument();
  expect(screen.getByText(`Error ID: ${error.id}`)).toBeInTheDocument();
  expect(box).toHaveValue("Keep me");
});

it("clears the text on success and refreshes the conversation", async () => {
  resolveWith({ ok: true, value: { messageId: "m9" } });
  const { user, box } = setup();
  await user.type(box, "Thanks");
  await user.keyboard("{Control>}{Enter}{/Control}");
  await vi.waitFor(() => expect(box).toHaveValue(""));
  expect(state.send).toHaveBeenCalledTimes(1);
  expect(state.invalidate).toHaveBeenCalled();
});

it("keeps the text and stays usable when the send rejects", async () => {
  state.send.mockRejectedValueOnce(new Error("network"));
  const { user, box } = setup();
  await user.type(box, "Still here");
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(
    await screen.findByText(
      "We could not confirm the send. Check the conversation before trying again.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/E_UI_003/)).toBeInTheDocument();
  expect(box).toHaveValue("Still here");
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("asks for a reload when the page outlived its deploy", async () => {
  state.stale.mockReturnValueOnce(true);
  state.send.mockRejectedValueOnce(new Error("Server Action was not found on the server"));
  const { user, box } = setup();
  await user.type(box, "Hello");
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(
    await screen.findByText(
      "Warpdrive was updated while this page was open. Reload the page, then send again.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/E_UI_002/)).toBeInTheDocument();
  expect(box).toHaveValue("Hello");
});

it("clears the text and says the reply will appear after sync when it was sent but not recorded", async () => {
  resolveWith({ ok: false, error: { id: "E_X_011" } });
  const { user, box } = setup();
  await user.type(box, "Sent once");
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(
    await screen.findByText(
      "Sent, but Warpdrive could not record it yet. It will appear after the next sync.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/E_X_011/)).toBeInTheDocument();
  expect(box).toHaveValue("");
});

it("disables Send while empty and while sending", async () => {
  let release: (r: ActionResult<{ messageId: string }>) => void = () => {};
  state.send.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const { user, box } = setup();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await user.type(box, "One");
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(screen.getByRole("button", { name: "Sending" })).toBeDisabled();
  expect(box).toBeDisabled();
  await user.keyboard("{Meta>}{Enter}{/Meta}");
  expect(state.send).toHaveBeenCalledTimes(1);
  release({ ok: true, value: { messageId: "m1" } });
  await vi.waitFor(() => expect(box).toHaveValue(""));
});

it("a template replaces an empty composer and appends after a blank line otherwise", async () => {
  const { user, box } = setup();
  await user.click(screen.getByRole("button", { name: "stub-template" }));
  expect(box).toHaveValue("Template body");
  await user.clear(box);
  await user.type(box, "Hi Ada");
  await user.click(screen.getByRole("button", { name: "stub-template" }));
  expect(box).toHaveValue("Hi Ada\n\nTemplate body");
});
