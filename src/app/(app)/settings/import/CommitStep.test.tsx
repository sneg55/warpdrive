// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(cleanup);

const getBatch = vi.fn();
const getResult = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    import: {
      getBatch: { useQuery: (...a: unknown[]) => getBatch(...a) },
      getResult: { useQuery: (...a: unknown[]) => getResult(...a) },
    },
  },
}));
// The realtime hook opens a WebSocket; stub it (its logic is covered by its own reducer test).
vi.mock("@/features/import/useImportProgress", () => ({
  useImportProgress: () => ({ processed: 0, total: 0, status: null }),
}));

import { CommitStep } from "./CommitStep";

it("shows the completed status and the exact server-computed split", () => {
  getBatch.mockReturnValue({ data: { status: "completed" } });
  getResult.mockReturnValue({ data: { imported: 5, skipped: 0, invalid: 0, total: 5 } });
  render(<CommitStep batchId="b1" onReset={vi.fn()} />);
  expect(screen.getByText("Import complete")).toBeInTheDocument();
  expect(screen.getByText(/5 imported/)).toBeInTheDocument();
});

it("shows partial status with the split and lets the user start over", () => {
  getBatch.mockReturnValue({ data: { status: "partial" } });
  getResult.mockReturnValue({ data: { imported: 3, skipped: 2, invalid: 0, total: 5 } });
  const onReset = vi.fn();
  render(<CommitStep batchId="b1" onReset={onReset} />);
  expect(screen.getByText("Import partially complete")).toBeInTheDocument();
  expect(screen.getByText("3 imported, 2 skipped, 0 failed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Import another file" }));
  expect(onReset).toHaveBeenCalledOnce();
});

it("shows the importing status while the commit job runs", () => {
  getBatch.mockReturnValue({ data: { status: "importing" } });
  getResult.mockReturnValue({ data: undefined });
  render(<CommitStep batchId="b1" onReset={vi.fn()} />);
  expect(screen.getByText("Importing...")).toBeInTheDocument();
});
