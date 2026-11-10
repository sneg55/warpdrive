// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FromPicker } from "./composer/FromPicker";

it("keeps one sender static and offers authorized mailbox choices when multiple exist", () => {
  const change = vi.fn();
  const mailboxes = [
    { id: "personal", emailAddress: "me@example.com", displayName: "Me" },
    { id: "team", emailAddress: "sales@example.com", displayName: "Sales" },
  ];
  const view = render(
    <FromPicker
      address="sales@example.com"
      accountId="team"
      mailboxes={mailboxes}
      onChange={change}
    />,
  );
  const trigger = screen.getByRole("combobox", { name: "From mailbox" });
  expect(trigger.textContent).toContain("Sales");
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: "Me <me@example.com>" }));
  expect(change).toHaveBeenCalledWith("personal");
  view.rerender(
    <FromPicker
      address="sales@example.com"
      accountId="team"
      mailboxes={mailboxes.slice(1)}
      onChange={change}
    />,
  );
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByText("sales@example.com")).toBeTruthy();
});
