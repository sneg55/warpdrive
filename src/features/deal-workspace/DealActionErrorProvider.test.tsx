// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { DealActionErrorProvider, useDealActionError } from "./DealActionErrorProvider";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

function Trigger({ errorId }: { errorId?: string }): React.ReactNode {
  const report = useDealActionError();
  return (
    <button type="button" onClick={() => report(errorId)}>
      go
    </button>
  );
}

it("shows no dialog until an action reports an error", () => {
  render(
    <DealActionErrorProvider>
      <Trigger errorId={ERROR_IDS.PERM_DENIED} />
    </DealActionErrorProvider>,
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("opens a permission-denied dialog when a denied action reports it", async () => {
  const user = userEvent.setup();
  render(
    <DealActionErrorProvider>
      <Trigger errorId={ERROR_IDS.PERM_DENIED} />
    </DealActionErrorProvider>,
  );

  await user.click(screen.getByRole("button", { name: "go" }));

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(/permission/i);
  expect(dialog).toHaveTextContent(/owner/i);
});

it("dismisses the dialog on close", async () => {
  const user = userEvent.setup();
  render(
    <DealActionErrorProvider>
      <Trigger errorId={ERROR_IDS.PERM_DENIED} />
    </DealActionErrorProvider>,
  );

  await user.click(screen.getByRole("button", { name: "go" }));
  await screen.findByRole("dialog");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("reloads the deal when a stale compare-and-swap is reported, so the retry the dialog asks for can succeed", async () => {
  const user = userEvent.setup();
  render(
    <DealActionErrorProvider>
      <Trigger errorId={ERROR_IDS.DEAL_PRECONDITION} />
    </DealActionErrorProvider>,
  );

  await user.click(screen.getByRole("button", { name: "go" }));

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(/changed elsewhere/i);
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

it("does not reload for failures a reload cannot fix", async () => {
  const user = userEvent.setup();
  render(
    <DealActionErrorProvider>
      <Trigger errorId={ERROR_IDS.PERM_DENIED} />
    </DealActionErrorProvider>,
  );

  await user.click(screen.getByRole("button", { name: "go" }));
  await screen.findByRole("dialog");
  expect(refresh).not.toHaveBeenCalled();
});
