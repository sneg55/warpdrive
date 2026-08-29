// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ContactPoint } from "@/types/contactPoint";
import { PersonBulkEditor } from "./PersonBulkEditor";

afterEach(cleanup);

const emails: ContactPoint[] = [
  { label: "work", value: "pat@ottawa.ca", primary: true },
  { label: "home", value: "pat@gmail.com", primary: false },
];
const phones: ContactPoint[] = [{ label: "work", value: "+1 555 111 2222", primary: true }];

function renderEditor(save = vi.fn(() => Promise.resolve({ ok: true }))) {
  render(
    <PersonBulkEditor
      firstName="Pat"
      lastName="Scrimgeour"
      phones={phones}
      emails={emails}
      save={save}
      onExit={() => {}}
    />,
  );
  return save;
}

it("opens every stored email at once, not just the primary", () => {
  renderEditor();
  expect(screen.getByLabelText("Email 1")).toHaveValue("pat@ottawa.ca");
  expect(screen.getByLabelText("Email 2")).toHaveValue("pat@gmail.com");
});

it("saves the whole email array when a non-primary address changes", async () => {
  const save = renderEditor();
  fireEvent.change(screen.getByLabelText("Email 2"), { target: { value: "pat@home.ca" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(save).toHaveBeenCalled());
  expect((save.mock.calls as unknown as unknown[][])[0]?.[0]).toEqual({
    emails: [
      { label: "work", value: "pat@ottawa.ca", primary: true },
      { label: "home", value: "pat@home.ca", primary: false },
    ],
  });
});

it("sends nothing for contact points the user did not touch", async () => {
  const save = renderEditor();
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Patrick" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(save).toHaveBeenCalled());
  expect((save.mock.calls as unknown as unknown[][])[0]?.[0]).toEqual({ firstName: "Patrick" });
});

it("locks the contact rows while the bulk save is in flight", async () => {
  let release = (): void => {};
  const save = vi.fn(
    () =>
      new Promise<{ ok: boolean }>((resolve) => {
        release = () => resolve({ ok: true });
      }),
  );
  renderEditor(save);
  fireEvent.change(screen.getByLabelText("Email 2"), { target: { value: "pat@home.ca" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.getByLabelText("Email 2")).toBeDisabled());
  release();
});
