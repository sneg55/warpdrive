// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const archiveDealAction = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true as const })));
vi.mock("@/features/deal-workspace/actions", () => ({ deleteDealAction: vi.fn() }));
vi.mock("@/features/deals/archiveActions", () => ({ archiveDealAction }));
vi.mock("@/features/deal-workspace/duplicateDealAction", () => ({ duplicateDealAction: vi.fn() }));
vi.mock("./ConvertToLeadDialog", () => ({ ConvertToLeadDialog: () => null }));
vi.mock("./MergeDealDialog", () => ({ MergeDealDialog: () => null }));
const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

import { ERROR_IDS } from "@/constants/errorIds";
import { DetailDrawerCloseContext } from "@/features/navigation/detailDrawerClose";
import { DealActionsMenu } from "./DealActionsMenu";

afterEach(() => {
  cleanup();
  archiveDealAction.mockClear();
  refresh.mockClear();
  push.mockClear();
  reportError.mockClear();
});

const props = {
  dealId: "d1",
  pipelineId: "p1",
  expectedUpdatedAt: "2026-07-02T00:00:00.000Z",
  canDelete: true,
};

async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
}

it("an archived deal offers Unarchive instead of Archive", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} archived />);
  await openMenu(user);
  expect(screen.getByRole("menuitem", { name: "Unarchive" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Archive" })).toBeNull();
});

it("Unarchive calls the archive action with archived false and refreshes", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} archived />);
  await openMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "Unarchive" }));
  await waitFor(() =>
    expect(archiveDealAction).toHaveBeenCalledWith({ dealId: "d1", archived: false }, "csrf"),
  );
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

it("Archive on an open deal calls the action with archived true", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} archived={false} />);
  await openMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "Archive" }));
  await waitFor(() =>
    expect(archiveDealAction).toHaveBeenCalledWith({ dealId: "d1", archived: true }, "csrf"),
  );
});

it("archiving inside a slide-over keeps the drawer open so the archived state is visible", async () => {
  const close = vi.fn();
  const user = userEvent.setup();
  render(
    <DetailDrawerCloseContext.Provider value={close}>
      <DealActionsMenu {...props} archived={false} />
    </DetailDrawerCloseContext.Provider>,
  );
  await openMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "Archive" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(close).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
});

it("surfaces the error when Unarchive is denied", async () => {
  archiveDealAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} archived />);
  await openMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "Unarchive" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(refresh).not.toHaveBeenCalled();
});

it("an archive that rejects reports an unconfirmed action and re-enables the menu", async () => {
  archiveDealAction.mockRejectedValueOnce(new Error("connection dropped"));
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} archived={false} />);
  await openMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "Archive" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith(ERROR_IDS.UI_ACTION_UNCONFIRMED));
  expect(screen.getByRole("button", { name: "Deal actions" })).toHaveProperty("disabled", false);
});
