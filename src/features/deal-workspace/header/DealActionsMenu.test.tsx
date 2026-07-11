// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const deleteDealAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, deal: { id: "d1", updatedAt: "x" } })),
);
const archiveDealAction = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true as const })));
const duplicateDealAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, deal: { id: "d2" } })),
);
vi.mock("@/features/deal-workspace/actions", () => ({ deleteDealAction }));
vi.mock("@/features/deals/archiveActions", () => ({ archiveDealAction }));
vi.mock("@/features/deal-workspace/duplicateDealAction", () => ({ duplicateDealAction }));
// The confirm dialogs own their own logic/tests; here we only assert the menu opens each flow.
vi.mock("./ConvertToLeadDialog", () => ({
  ConvertToLeadDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="convert-dialog" /> : null,
}));
vi.mock("./MergeDealDialog", () => ({
  MergeDealDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="merge-dialog" /> : null,
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

import { DealActionsMenu } from "./DealActionsMenu";

const writeText = vi.fn(() => Promise.resolve());

// userEvent.setup() installs its own navigator.clipboard stub, so any test whose component reads
// navigator.clipboard must (re)define the mock AFTER setup(). Hence this helper, not a beforeEach.
function mockClipboard(): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

afterEach(() => {
  cleanup();
  deleteDealAction.mockClear();
  archiveDealAction.mockClear();
  duplicateDealAction.mockClear();
  writeText.mockClear();
  push.mockClear();
  reportError.mockClear();
  vi.restoreAllMocks();
});

const props = {
  dealId: "d1",
  pipelineId: "p1",
  expectedUpdatedAt: "2026-07-02T00:00:00.000Z",
  canDelete: true,
};

it("the ellipsis opens the actions menu", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  expect(screen.queryByRole("menu")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  expect(screen.getByRole("menu")).toBeTruthy();
});

it("renders the six deal-actions items in Pipedrive order", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  const labels = screen.getAllByRole("menuitem").map((el) => el.textContent);
  expect(labels).toEqual([
    "Copy link",
    "Duplicate",
    "Convert to a lead",
    "Merge",
    "Archive",
    "Delete deal",
  ]);
});

it("Copy link writes the deal URL to the clipboard", async () => {
  const user = userEvent.setup();
  mockClipboard();
  render(<DealActionsMenu {...props} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Copy link" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${location.origin}/deals/d1`));
});

it("Duplicate calls duplicateDealAction and navigates to the new deal", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
  await waitFor(() => expect(duplicateDealAction).toHaveBeenCalledWith({ dealId: "d1" }, "csrf"));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/deals/d2"));
});

it("Convert to a lead opens the convert confirm dialog", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Convert to a lead" }));
  expect(screen.getByTestId("convert-dialog")).toBeTruthy();
});

it("Merge opens the merge picker dialog", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Merge" }));
  expect(screen.getByTestId("merge-dialog")).toBeTruthy();
});

it("Delete confirms then calls deleteDealAction", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete deal" }));
  expect(window.confirm).toHaveBeenCalled();
  expect(deleteDealAction).toHaveBeenCalledWith(
    { dealId: "d1", expectedUpdatedAt: props.expectedUpdatedAt },
    "csrf",
  );
});

it("Delete does nothing when the confirm is dismissed", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete deal" }));
  expect(deleteDealAction).not.toHaveBeenCalled();
});

it("surfaces the error when Duplicate is denied (no silent swallow)", async () => {
  duplicateDealAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(push).not.toHaveBeenCalled();
});

it("surfaces the error when Archive is denied (no silent swallow)", async () => {
  archiveDealAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Archive" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
});

it("surfaces the error when Delete is denied (no silent swallow)", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  deleteDealAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete deal" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(push).not.toHaveBeenCalled();
});

// PERMISSIONS-05: the destructive item must not render for a user without deal.delete, so they
// are never offered an action that the server would reject.
it("hides Delete deal when canDelete is false", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} canDelete={false} />);
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  expect(screen.queryByRole("menuitem", { name: "Delete deal" })).toBeNull();
  // The non-destructive items still render.
  expect(screen.getByRole("menuitem", { name: "Copy link" })).toBeTruthy();
});
