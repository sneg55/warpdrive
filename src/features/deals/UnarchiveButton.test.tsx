// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { UnarchiveButton } from "./UnarchiveButton";

afterEach(cleanup);

function deferred(): { promise: Promise<boolean>; resolve: (v: boolean) => void } {
  let resolve: (v: boolean) => void = () => {};
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

it("disables itself and reads Unarchiving while the unarchive is in flight", async () => {
  const pending = deferred();
  const user = userEvent.setup();
  render(<UnarchiveButton onUnarchive={() => pending.promise} />);

  await user.click(screen.getByRole("button", { name: "Unarchive" }));

  const busy = screen.getByRole("button", { name: "Unarchiving" });
  expect(busy).toHaveProperty("disabled", true);
  expect(busy.getAttribute("aria-busy")).toBe("true");
  await act(async () => {
    pending.resolve(true);
    await pending.promise;
  });
});

it("re-enables after a failed unarchive so the user can try again", async () => {
  const pending = deferred();
  const user = userEvent.setup();
  render(<UnarchiveButton onUnarchive={() => pending.promise} />);

  await user.click(screen.getByRole("button", { name: "Unarchive" }));
  await act(async () => {
    pending.resolve(false);
    await pending.promise;
  });

  expect(screen.getByRole("button", { name: "Unarchive" })).toHaveProperty("disabled", false);
});
