// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const report = vi.hoisted(() => vi.fn());
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => report }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const BATCH = {
  id: "b1",
  filename: "people.csv",
  targetEntity: "people",
  status: "completed",
  importedRows: 3,
  errorRows: 0,
  undoneAt: null,
};
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ import: { listBatches: { invalidate: vi.fn() } } }),
    import: { listBatches: { useQuery: () => ({ data: [BATCH] }) } },
  },
}));

const undoImportAction = vi.hoisted(() =>
  vi.fn<() => Promise<MockActionResult>>(() => Promise.resolve({ ok: true, value: undefined })),
);
vi.mock("@/features/import/actions", () => ({ undoImportAction }));

import type { MockActionResult } from "@/test/actionResult";
import { ImportHistory } from "./ImportHistory";

describe("ImportHistory surfaces failed undo", () => {
  it("reports the error id when undo is denied", async () => {
    undoImportAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    render(<ImportHistory />);
    fireEvent.click(screen.getByRole("button", { name: STRINGS.settings.importer.undo }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });
});
