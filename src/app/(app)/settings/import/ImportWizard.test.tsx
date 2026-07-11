// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.resolve({ ok: true } as Response)),
);
// The realtime hook opens a WebSocket; stub it so the wait steps render without one.
vi.mock("@/features/import/useImportProgress", () => ({
  useImportProgress: () => ({ processed: 0, total: 0, status: null }),
}));

type Res<T> = { ok: true; value: T } | { ok: false; error: { id: string } };
type ActionFn<T> = (input: unknown, csrf: unknown) => Promise<Res<T>>;
const actions = vi.hoisted(() => ({
  requestImportUploadAction: vi.fn<
    ActionFn<{ batchId: string; post: { url: string; fields: Record<string, string> } }>
  >(() =>
    Promise.resolve({
      ok: true,
      value: { batchId: "b1", post: { url: "http://minio", fields: {} } },
    }),
  ),
  confirmImportUploadAction: vi.fn<ActionFn<{ batchId: string }>>(() =>
    Promise.resolve({ ok: true, value: { batchId: "b1" } }),
  ),
  setMappingAction: vi.fn<ActionFn<{ batchId: string }>>(() =>
    Promise.resolve({ ok: true, value: { batchId: "b1" } }),
  ),
  commitBatchAction: vi.fn<ActionFn<{ imported: number; skipped: number; invalid: number }>>(() =>
    Promise.resolve({ ok: true, value: { imported: 0, skipped: 0, invalid: 0 } }),
  ),
}));
vi.mock("@/features/import/actions", () => actions);

// The prepare wait polls getBatch; return a parsed batch so it advances to the map step.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    import: {
      listRows: { useQuery: () => ({ data: [] }) },
      getResult: { useQuery: () => ({ data: undefined }) },
      getBatch: {
        useQuery: () => ({
          data: {
            status: "mapping_ready",
            headers: ["name"],
            totalRows: 1,
            validRows: 0,
            errorRows: 0,
          },
        }),
      },
    },
  },
}));

import { ImportWizard } from "./ImportWizard";

it("uploads via the presign handshake, then advances to the map step", async () => {
  render(<ImportWizard personDefs={[]} orgDefs={[]} dealDefs={[]} activityDefs={[]} />);
  const file = new File(["name\nJane\n"], "c.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });

  await waitFor(() => expect(actions.requestImportUploadAction).toHaveBeenCalledOnce());
  expect(actions.confirmImportUploadAction).toHaveBeenCalledWith("b1", "csrf");
  // prepare wait sees mapping_ready and hands the server-parsed header to the map step.
  await waitFor(() => expect(screen.getByLabelText("Maps to: name")).toBeInTheDocument());
});

it("surfaces an error banner when the upload request fails", async () => {
  actions.requestImportUploadAction.mockResolvedValueOnce({
    ok: false,
    error: { id: "E_PERM_DENIED" },
  });
  render(<ImportWizard personDefs={[]} orgDefs={[]} dealDefs={[]} activityDefs={[]} />);
  const file = new File(["name\nJane\n"], "c.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
});
