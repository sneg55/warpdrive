// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { ActionErrorProvider, useActionError } from "./ActionErrorProvider";

afterEach(cleanup);

function Trigger({ errorId }: { errorId?: string }): React.ReactNode {
  const report = useActionError();
  return (
    <button type="button" onClick={() => report(errorId)}>
      go
    </button>
  );
}

it("provides a no-op reporter outside any provider (no crash)", async () => {
  const user = userEvent.setup();
  // Rendered with NO provider: useActionError falls back to the no-op default.
  render(<Trigger errorId={ERROR_IDS.PERM_DENIED} />);
  await user.click(screen.getByRole("button", { name: "go" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("shows no dialog until an action reports a failure", () => {
  render(
    <ActionErrorProvider>
      <Trigger errorId={ERROR_IDS.PERM_DENIED} />
    </ActionErrorProvider>,
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("opens a permission dialog when a denied action reports it", async () => {
  const user = userEvent.setup();
  render(
    <ActionErrorProvider>
      <Trigger errorId={ERROR_IDS.PERM_DENIED} />
    </ActionErrorProvider>,
  );
  await user.click(screen.getByRole("button", { name: "go" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(/permission/i);
});

it("falls back to generic copy for an unmapped error id", async () => {
  const user = userEvent.setup();
  render(
    <ActionErrorProvider>
      <Trigger errorId="E_SOMETHING_UNMAPPED" />
    </ActionErrorProvider>,
  );
  await user.click(screen.getByRole("button", { name: "go" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(/went wrong|try again/i);
});

it("dismisses the dialog on close", async () => {
  const user = userEvent.setup();
  render(
    <ActionErrorProvider>
      <Trigger errorId={ERROR_IDS.PERM_DENIED} />
    </ActionErrorProvider>,
  );
  await user.click(screen.getByRole("button", { name: "go" }));
  await screen.findByRole("dialog");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
