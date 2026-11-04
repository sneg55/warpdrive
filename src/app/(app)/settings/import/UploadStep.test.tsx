// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { requestImportUploadAction } from "@/features/import/actions";
import { initialWizardState } from "@/features/import/wizardState";
import { UploadStep } from "./UploadStep";

vi.mock("@/features/import/actions", () => ({
  requestImportUploadAction: vi.fn(() =>
    Promise.resolve({
      ok: true,
      value: { batchId: "b1", post: { url: "http://garage", fields: {} } },
    }),
  ),
  confirmImportUploadAction: vi.fn(() => Promise.resolve({ ok: true, value: { batchId: "b1" } })),
}));
vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.resolve({ ok: true } as Response)),
);
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

afterEach(cleanup);

it("runs the presign handshake and dispatches uploaded", async () => {
  const dispatch = vi.fn();
  render(
    <UploadStep state={initialWizardState()} dispatch={dispatch} busy={false} onError={() => {}} />,
  );
  const file = new File(["Name\nA"], "c.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText(/csv file/i, { selector: "input[type=file]" }), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith({
      type: "uploaded",
      batchId: "b1",
      source: "csv",
      target: "person",
    }),
  );
});

it("uploads a file dropped onto the dropzone", async () => {
  const dispatch = vi.fn();
  render(
    <UploadStep state={initialWizardState()} dispatch={dispatch} busy={false} onError={() => {}} />,
  );
  const zone = screen.getByTestId("import-dropzone");
  const file = new File(["Name\nA"], "dropped.csv", { type: "text/csv" });
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
  await waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith({
      type: "uploaded",
      batchId: "b1",
      source: "csv",
      target: "person",
    }),
  );
});

it("highlights the dropzone while a file is dragged over it", () => {
  render(
    <UploadStep state={initialWizardState()} dispatch={vi.fn()} busy={false} onError={() => {}} />,
  );
  const zone = screen.getByTestId("import-dropzone");
  expect(zone).toHaveAttribute("data-dragging", "false");
  fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
  expect(zone).toHaveAttribute("data-dragging", "true");
  fireEvent.dragLeave(zone);
  expect(zone).toHaveAttribute("data-dragging", "false");
});

it("offers a CSV file and Pipedrive export source, defaulting to CSV", () => {
  render(
    <UploadStep state={initialWizardState()} dispatch={vi.fn()} busy={false} onError={() => {}} />,
  );
  expect(screen.getByRole("radio", { name: "CSV file" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Pipedrive export" })).not.toBeChecked();
});

it("dispatches setSource when Pipedrive export is chosen", () => {
  const dispatch = vi.fn();
  render(
    <UploadStep state={initialWizardState()} dispatch={dispatch} busy={false} onError={() => {}} />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Pipedrive export" }));
  expect(dispatch).toHaveBeenCalledWith({ type: "setSource", source: "pipedrive" });
});

it("offers the Notes target only for a Pipedrive source", () => {
  const { rerender } = render(
    <UploadStep state={initialWizardState()} dispatch={vi.fn()} busy={false} onError={() => {}} />,
  );
  expect(screen.queryByRole("radio", { name: "Notes" })).not.toBeInTheDocument();
  rerender(
    <UploadStep
      state={{ ...initialWizardState(), source: "pipedrive" }}
      dispatch={vi.fn()}
      busy={false}
      onError={() => {}}
    />,
  );
  expect(screen.getByRole("radio", { name: "Notes" })).toBeInTheDocument();
});

it("sends the chosen source with the batch request", async () => {
  render(
    <UploadStep
      state={{ ...initialWizardState(), source: "pipedrive", target: "deal" }}
      dispatch={vi.fn()}
      busy={false}
      onError={() => {}}
    />,
  );
  const file = new File(["Title\nA"], "p.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText(/csv file/i, { selector: "input[type=file]" }), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(requestImportUploadAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: "pipedrive", targetEntity: "deal" }),
      "csrf",
    ),
  );
});

it("disables the source and target choices while an upload is in flight", async () => {
  vi.mocked(requestImportUploadAction).mockReturnValueOnce(new Promise(() => {}));
  render(
    <UploadStep state={initialWizardState()} dispatch={vi.fn()} busy={false} onError={() => {}} />,
  );
  expect(screen.getByRole("radio", { name: "Pipedrive export" })).toBeEnabled();
  const file = new File(["Name\nA"], "c.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText(/csv file/i, { selector: "input[type=file]" }), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "Pipedrive export" })).toBeDisabled(),
  );
  for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
});
