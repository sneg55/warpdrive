// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgenticConnectDialog } from "./AgenticConnectDialog";

const connect = vi.hoisted(() => vi.fn());
const reconnect = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./agenticConnect", () => ({
  connectAgenticInbox: connect,
  reconnectAgenticInbox: reconnect,
}));
afterEach(cleanup);
beforeEach(() => {
  connect.mockReset();
  reconnect.mockReset();
  refresh.mockReset();
});

it("the dialog renders the six fields and shows the server error text", async () => {
  connect.mockResolvedValue({ ok: false, error: { id: "E_AINBOX_002" } });
  render(<AgenticConnectDialog open onOpenChange={vi.fn()} reconnectTarget={null} />);
  const secret = screen.getByLabelText("Client secret");
  expect(secret).toHaveAttribute("type", "password");
  expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
  expect(screen.getByLabelText("Mailbox address")).toBeInTheDocument();
  expect(screen.getByLabelText("Display name")).toBeInTheDocument();
  expect(screen.getByLabelText("Client ID")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Import history" })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Base URL"), "https://inbox.example.com");
  await userEvent.type(screen.getByLabelText("Mailbox address"), "media@example.com");
  await userEvent.type(screen.getByLabelText("Display name"), "Media");
  await userEvent.type(screen.getByLabelText("Client ID"), "cid");
  await userEvent.type(secret, "csecret");
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(connect).toHaveBeenCalledWith(null, {
    baseUrl: "https://inbox.example.com",
    address: "media@example.com",
    displayName: "Media",
    clientId: "cid",
    clientSecret: "csecret",
    backfillDays: 90,
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(/warpdrive/i);
  expect(refresh).not.toHaveBeenCalled();
});

it("reconnect mode asks only for the client id and secret", async () => {
  reconnect.mockResolvedValue({ ok: true, value: { accountId: "acct" } });
  const close = vi.fn();
  render(
    <AgenticConnectDialog
      open
      onOpenChange={close}
      reconnectTarget={{ accountId: "acct", address: "media@example.com" }}
    />,
  );
  expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Mailbox address")).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Client ID"), "cid");
  await userEvent.type(screen.getByLabelText("Client secret"), "csecret");
  await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(reconnect).toHaveBeenCalledWith(null, {
    accountId: "acct",
    clientId: "cid",
    clientSecret: "csecret",
  });
  expect(close).toHaveBeenCalledWith(false);
  expect(refresh).toHaveBeenCalled();
});

function Harness(): React.ReactNode {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <AgenticConnectDialog open={open} onOpenChange={setOpen} reconnectTarget={null} />
    </>
  );
}

it("closing the dialog clears the client secret", async () => {
  render(<Harness />);
  await userEvent.type(screen.getByLabelText("Client secret"), "csecret");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByLabelText("Client secret")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Open dialog" }));
  expect(screen.getByLabelText("Client secret")).toHaveValue("");
});

it("a failed attempt clears the client secret", async () => {
  connect.mockResolvedValue({ ok: false, error: { id: "E_AINBOX_001" } });
  render(<AgenticConnectDialog open onOpenChange={vi.fn()} reconnectTarget={null} />);
  await userEvent.type(screen.getByLabelText("Client ID"), "cid");
  await userEvent.type(screen.getByLabelText("Client secret"), "csecret");
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByLabelText("Client secret")).toHaveValue("");
  expect(screen.getByLabelText("Client ID")).toHaveValue("cid");
});
