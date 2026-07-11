// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { initialWizardState } from "@/features/import/wizardState";
import { UploadStep } from "./UploadStep";

vi.mock("@/features/import/actions", () => ({
  requestImportUploadAction: vi.fn(() =>
    Promise.resolve({
      ok: true,
      value: { batchId: "b1", post: { url: "http://minio", fields: {} } },
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
  fireEvent.change(screen.getByLabelText(/csv file/i), { target: { files: [file] } });
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "uploaded", batchId: "b1" }));
});

it("uploads a file dropped onto the dropzone", async () => {
  const dispatch = vi.fn();
  render(
    <UploadStep state={initialWizardState()} dispatch={dispatch} busy={false} onError={() => {}} />,
  );
  const zone = screen.getByTestId("import-dropzone");
  const file = new File(["Name\nA"], "dropped.csv", { type: "text/csv" });
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "uploaded", batchId: "b1" }));
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
