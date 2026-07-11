// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const mergeDealsAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, deal: { id: "d1" } })),
);
vi.mock("@/features/deal-workspace/mergeDealsAction", () => ({ mergeDealsAction }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    deal: {
      list: {
        useQuery: () => ({
          data: {
            rows: [{ id: "d2", title: "Beta deal", updatedAt: "2026-07-01T00:00:00.000Z" }],
          },
        }),
      },
    },
  },
}));
// cmdk/Popover are exercised elsewhere; a lightweight stub lets us drive the source selection
// without wrestling cmdk's jsdom quirks. The test's focus is confirm/error handling.
vi.mock("@/components/ui/Combobox", () => ({
  Combobox: ({ onChange }: { onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange("d2")}>
      pick-source
    </button>
  ),
}));
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

import { MergeDealDialog } from "./MergeDealDialog";

afterEach(() => {
  cleanup();
  mergeDealsAction.mockClear();
  refresh.mockClear();
  reportError.mockClear();
});

const props = {
  dealId: "d1",
  pipelineId: "p1",
  expectedUpdatedAt: "2026-07-02T00:00:00.000Z",
  open: true,
  onOpenChange: vi.fn(),
};

it("confirming merges the picked source into this deal and refreshes", async () => {
  const user = userEvent.setup();
  render(<MergeDealDialog {...props} />);
  await user.click(screen.getByRole("button", { name: "pick-source" }));
  await user.click(screen.getByRole("button", { name: "Merge" }));
  await waitFor(() =>
    expect(mergeDealsAction).toHaveBeenCalledWith(
      expect.objectContaining({ targetDealId: "d1", sourceDealId: "d2" }),
      "csrf",
    ),
  );
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

it("surfaces the error and does not refresh when the merge is denied", async () => {
  mergeDealsAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  const user = userEvent.setup();
  render(<MergeDealDialog {...props} />);
  await user.click(screen.getByRole("button", { name: "pick-source" }));
  await user.click(screen.getByRole("button", { name: "Merge" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(refresh).not.toHaveBeenCalled();
});
