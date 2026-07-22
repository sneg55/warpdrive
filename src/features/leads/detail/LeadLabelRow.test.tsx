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
          data: [{ id: "l1", target: "lead", name: "Hot", color: "red", order: 0 }],
        }),
      },
    },
  },
}));

type UpdateResult =
  | { ok: true; value: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };
const updateLeadAction = vi.hoisted(() =>
  vi.fn(
    (): Promise<UpdateResult> =>
      Promise.resolve({ ok: true, value: { id: "lead1", updatedAt: "2026-07-03T00:00:00.000Z" } }),
  ),
);
vi.mock("@/features/leads/leadServerActions", () => ({ updateLeadAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { ActionErrorProvider } from "@/components/shell/ActionErrorProvider";
import { LeadLabelRow } from "./LeadLabelRow";

afterEach(() => {
  cleanup();
  updateLeadAction.mockClear();
});

const props = { leadId: "lead1", expectedUpdatedAt: "2026-07-02T00:00:00.000Z", labels: [] };

it("commits the toggled label set through updateLeadAction", async () => {
  const user = userEvent.setup();
  render(
    <ActionErrorProvider>
      <LeadLabelRow {...props} />
    </ActionErrorProvider>,
  );

  await user.click(screen.getByRole("button", { name: /add labels/i }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: /hot/i }));

  expect(updateLeadAction).toHaveBeenCalledWith(
    { leadId: "lead1", expectedUpdatedAt: "2026-07-02T00:00:00.000Z", labels: ["Hot"] },
    "csrf",
  );
});

it("surfaces the shared error dialog when a label edit is denied (no silent revert)", async () => {
  const user = userEvent.setup();
  updateLeadAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: ERROR_IDS.PERM_DENIED },
  });
  render(
    <ActionErrorProvider>
      <LeadLabelRow {...props} />
    </ActionErrorProvider>,
  );

  await user.click(screen.getByRole("button", { name: /add labels/i }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: /hot/i }));

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(/permission/i);
});
