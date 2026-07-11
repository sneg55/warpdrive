// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";

beforeAll(() => {
  // Radix DropdownMenu (in CatalogLabelPicker) reaches for these jsdom-missing APIs.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    labels: {
      listByTarget: {
        useQuery: () => ({
          data: [{ id: "l1", target: "deal", name: "Hot", color: "red", order: 0 }],
        }),
      },
    },
  },
}));

type UpdateResult =
  | { ok: true; deal: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };
const updateDealAction = vi.hoisted(() =>
  vi.fn(
    (): Promise<UpdateResult> => Promise.resolve({ ok: true, deal: { id: "d1", updatedAt: "x" } }),
  ),
);
vi.mock("@/features/deals/updateAction", () => ({ updateDealAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { DealActionErrorProvider } from "./DealActionErrorProvider";
import { LabelRow } from "./LabelRow";

afterEach(() => {
  cleanup();
  updateDealAction.mockClear();
});

const props = { dealId: "d1", expectedUpdatedAt: "2026-07-02T00:00:00.000Z", labels: [] };

it("surfaces the shared error dialog when a label edit is denied (no silent revert)", async () => {
  const user = userEvent.setup();
  updateDealAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: ERROR_IDS.PERM_DENIED },
  });
  render(
    <DealActionErrorProvider>
      <LabelRow {...props} />
    </DealActionErrorProvider>,
  );

  await user.click(screen.getByRole("button", { name: /add labels/i }));
  // Toggle the "Hot" catalog label in the dropdown picker.
  await user.click(await screen.findByRole("menuitemcheckbox", { name: /hot/i }));

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(/permission/i);
});
