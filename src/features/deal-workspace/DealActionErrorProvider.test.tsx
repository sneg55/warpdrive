// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { DealActionErrorProvider, useDealActionError } from "./DealActionErrorProvider";

afterEach(cleanup);

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
