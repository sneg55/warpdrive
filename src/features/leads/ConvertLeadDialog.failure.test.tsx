// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { ConvertLeadDialog } from "./ConvertLeadDialog";

afterEach(cleanup);

const grade: CustomFieldDef = {
  id: "cf-grade",
  targetEntity: "deal",
  type: "text",
  name: "Grade",
  key: "grade",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: true,
  order: 0,
  archivedAt: null,
};

it("shows the failure message, keeps the values, and stays open when the handoff fails", async () => {
  const onClose = vi.fn();
  const onConvert = vi.fn(() =>
    Promise.resolve({
      ok: false as const,
      id: "E_DB_003",
      message: "Could not convert (E_DB_003)",
    }),
  );
  render(
    <ConvertLeadDialog
      defs={[grade]}
      onClose={onClose}
      onConvert={onConvert}
      onLateFailure={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "B" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not convert (E_DB_003)");
  expect(screen.getByLabelText("Grade")).toHaveValue("B");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(onClose).not.toHaveBeenCalled();
});

it("closes on success", async () => {
  const onClose = vi.fn();
  const onConvert = vi.fn(() => Promise.resolve({ ok: true as const }));
  render(
    <ConvertLeadDialog
      defs={[grade]}
      onClose={onClose}
      onConvert={onConvert}
      onLateFailure={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

it("shows an unconfirmed error and re-enables Save when the handoff itself throws", async () => {
  const onClose = vi.fn();
  const onConvert = vi.fn(() => Promise.reject(new TypeError("boom")));
  render(
    <ConvertLeadDialog
      defs={[grade]}
      onClose={onClose}
      onConvert={onConvert}
      onLateFailure={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "B" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_003");
  expect(screen.getByLabelText("Grade")).toHaveValue("B");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(onClose).not.toHaveBeenCalled();
});

function deferred(): {
  promise: Promise<{ ok: false; id: string; message: string }>;
  fail: () => void;
} {
  let fail: () => void = () => undefined;
  const promise = new Promise<{ ok: false; id: string; message: string }>((resolve) => {
    fail = () => resolve({ ok: false, id: "E_DB_003", message: "Could not convert (E_DB_003)" });
  });
  return { promise, fail };
}

it("hands a failure to the parent when the dialog was dismissed before the result arrived", async () => {
  const onLateFailure = vi.fn();
  const held = deferred();
  const onConvert = vi.fn(() => held.promise);
  const { rerender } = render(
    <ConvertLeadDialog
      defs={[grade]}
      onClose={() => undefined}
      onConvert={onConvert}
      onLateFailure={onLateFailure}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onConvert).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  held.fail();
  await waitFor(() =>
    expect(onLateFailure).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, id: "E_DB_003" }),
    ),
  );
  rerender(<div />);
});

it("hands a failure to the parent when the dialog unmounted before the result arrived", async () => {
  const onLateFailure = vi.fn();
  const held = deferred();
  const onConvert = vi.fn(() => held.promise);
  const { unmount } = render(
    <ConvertLeadDialog
      defs={[grade]}
      onClose={() => undefined}
      onConvert={onConvert}
      onLateFailure={onLateFailure}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onConvert).toHaveBeenCalled());
  unmount();
  held.fail();
  await waitFor(() => expect(onLateFailure).toHaveBeenCalledTimes(1));
});

it("keeps the failure inside an open dialog and does not use the parent fallback", async () => {
  const onLateFailure = vi.fn();
  const held = deferred();
  render(
    <ConvertLeadDialog
      defs={[grade]}
      onClose={() => undefined}
      onConvert={() => held.promise}
      onLateFailure={onLateFailure}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  held.fail();
  expect(await screen.findByRole("alert")).toHaveTextContent("E_DB_003");
  expect(onLateFailure).not.toHaveBeenCalled();
});
