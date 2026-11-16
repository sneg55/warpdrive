// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { XUnlockDialog } from "./XUnlockDialog";

afterEach(cleanup);

const unlock = vi.hoisted(() => vi.fn());
vi.mock("../chatKeyActions", () => ({ unlockChatKeysAction: unlock }));

beforeEach(() => {
  unlock.mockReset();
});

function setup() {
  const onOpenChange = vi.fn();
  const onUnlocked = vi.fn();
  render(
    <XUnlockDialog accountId="acc" open onOpenChange={onOpenChange} onUnlocked={onUnlocked} />,
  );
  return { onOpenChange, onUnlocked };
}

const passcodeField = () => screen.getByLabelText("Passcode");

it("uses a password input and shows the attempts note", () => {
  setup();
  expect(passcodeField()).toHaveAttribute("type", "password");
  expect(
    screen.getByText("Each wrong passcode uses up one of a limited number of attempts at X."),
  ).toBeInTheDocument();
});

it("submits once per click with the passcode and account", async () => {
  unlock.mockResolvedValue({ ok: true, value: { keyVersion: "1" } });
  setup();
  await userEvent.type(passcodeField(), "1234");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(unlock).toHaveBeenCalledWith({ accountId: "acc", passcode: "1234" }, null);
});

it("closes and reports success", async () => {
  unlock.mockResolvedValue({ ok: true, value: { keyVersion: "1" } });
  const { onOpenChange, onUnlocked } = setup();
  await userEvent.type(passcodeField(), "1234");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(onUnlocked).toHaveBeenCalled();
});

it("shows remaining attempts, clears the field and stays open on a wrong passcode", async () => {
  unlock.mockResolvedValue({ ok: false, error: { id: "E_X_013", guessesRemaining: 4 } });
  const { onOpenChange } = setup();
  await userEvent.type(passcodeField(), "0000");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(await screen.findByText("Wrong passcode. X allows 4 more attempts.")).toBeInTheDocument();
  expect(passcodeField()).toHaveValue("");
  expect(onOpenChange).not.toHaveBeenCalled();
});

it("uses the singular for one attempt", async () => {
  unlock.mockResolvedValue({ ok: false, error: { id: "E_X_013", guessesRemaining: 1 } });
  setup();
  await userEvent.type(passcodeField(), "0000");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(await screen.findByText("Wrong passcode. X allows 1 more attempt.")).toBeInTheDocument();
});

it("tells the admin the keys are gone at zero attempts", async () => {
  unlock.mockResolvedValue({ ok: false, error: { id: "E_X_013", guessesRemaining: 0 } });
  setup();
  await userEvent.type(passcodeField(), "0000");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(
    await screen.findByText(
      "No attempts left. The keys are gone at X; set up encrypted messages again in the X app.",
    ),
  ).toBeInTheDocument();
});

it("shows the error id for other failures and clears the field", async () => {
  unlock.mockResolvedValue({ ok: false, error: { id: "E_X_015" } });
  setup();
  await userEvent.type(passcodeField(), "1234");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(await screen.findByText(/E_X_015/)).toBeInTheDocument();
  expect(passcodeField()).toHaveValue("");
});

it("does not submit an empty passcode", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(unlock).not.toHaveBeenCalled();
});

it("disables the button while pending so a second click cannot resubmit", async () => {
  let release: (v: unknown) => void = () => undefined;
  unlock.mockReturnValue(new Promise((resolve) => (release = resolve)));
  setup();
  await userEvent.type(passcodeField(), "1234");
  const button = screen.getByRole("button", { name: "Unlock" });
  await userEvent.click(button);
  await userEvent.click(button);
  expect(unlock).toHaveBeenCalledTimes(1);
  release({ ok: false, error: { id: "E_X_015" } });
  await screen.findByText(/E_X_015/);
});

it("shows a generic failure and clears the field when the action rejects", async () => {
  unlock.mockRejectedValue(new Error("network"));
  const { onOpenChange } = setup();
  await userEvent.type(passcodeField(), "1234");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(await screen.findByText("Could not unlock. Try again.")).toBeInTheDocument();
  expect(passcodeField()).toHaveValue("");
  expect(onOpenChange).not.toHaveBeenCalled();
});

it("drops the previous message when the dialog is reopened", async () => {
  unlock.mockResolvedValue({ ok: false, error: { id: "E_X_013", guessesRemaining: 4 } });
  const props = { accountId: "acc", onOpenChange: vi.fn(), onUnlocked: vi.fn() };
  const view = render(<XUnlockDialog {...props} open />);
  await userEvent.type(passcodeField(), "0000");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  await screen.findByText("Wrong passcode. X allows 4 more attempts.");
  view.rerender(<XUnlockDialog {...props} open={false} />);
  view.rerender(<XUnlockDialog {...props} open />);
  expect(screen.queryByText(/Wrong passcode/)).not.toBeInTheDocument();
});

it("says the passcode is wrong without a count when X gives none", async () => {
  unlock.mockResolvedValue({ ok: false, error: { id: "E_X_013" } });
  setup();
  await userEvent.type(passcodeField(), "0000");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(await screen.findByText("Wrong passcode.")).toBeInTheDocument();
});

it("cannot be dismissed by Escape or an overlay press while the unlock is pending", async () => {
  let release: (v: unknown) => void = () => undefined;
  unlock.mockReturnValue(new Promise((resolve) => (release = resolve)));
  const { onOpenChange } = setup();
  await userEvent.type(passcodeField(), "1234");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  await userEvent.keyboard("{Escape}");
  const overlay = document.querySelector<HTMLElement>("div.fixed.inset-0");
  if (overlay !== null) {
    fireEvent.pointerDown(overlay, { button: 0, pointerType: "mouse" });
    fireEvent.click(overlay, { button: 0 });
  }
  expect(overlay).not.toBeNull();
  expect(onOpenChange).not.toHaveBeenCalled();
  release({ ok: false, error: { id: "E_X_015" } });
  await screen.findByText(/E_X_015/);
  await userEvent.keyboard("{Escape}");
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
