// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

import { DetailDrawerCloseContext } from "@/features/navigation/detailDrawerClose";
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

// Opens the menu and picks "Delete deal", returning the confirmation surface it raises.
async function openDeleteConfirm(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: "Deal actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete deal" }));
  return await screen.findByRole("alertdialog");
}

// The destructive confirm is the shadcn AlertDialog, never the browser's window.confirm chrome.
it("Delete deal raises an in-app confirm dialog, not a native browser confirm", async () => {
  const nativeConfirm = vi.spyOn(window, "confirm");
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  const dialog = await openDeleteConfirm(user);
  expect(within(dialog).getByText("Delete this deal?")).toBeTruthy();
  expect(nativeConfirm).not.toHaveBeenCalled();
  expect(deleteDealAction).not.toHaveBeenCalled();
});

it("confirming the dialog calls deleteDealAction and returns to the pipeline", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  const dialog = await openDeleteConfirm(user);
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() =>
    expect(deleteDealAction).toHaveBeenCalledWith(
      { dealId: "d1", expectedUpdatedAt: props.expectedUpdatedAt },
      "csrf",
    ),
  );
  await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline"));
});

it("dismisses the drawer instead of pushing when the deal is open as a slide-over", async () => {
  // Pushing here is a soft navigation, and Next renders a parallel slot's previously active state
  // on one, so the drawer would stay open on the deal that was just deleted.
  const close = vi.fn();
  const user = userEvent.setup();
  render(
    <DetailDrawerCloseContext.Provider value={close}>
      <DealActionsMenu {...props} />
    </DetailDrawerCloseContext.Provider>,
  );
  const dialog = await openDeleteConfirm(user);
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(push).not.toHaveBeenCalled();
});

it("cancelling the dialog closes it without deleting", async () => {
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  const dialog = await openDeleteConfirm(user);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
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
  deleteDealAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  const user = userEvent.setup();
  render(<DealActionsMenu {...props} />);
  const dialog = await openDeleteConfirm(user);
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));
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
