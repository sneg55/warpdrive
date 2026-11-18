// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LEAD, REF_LABELS, stubRadixPointer } from "./inbox/leadsInboxTestMocks";

beforeAll(stubRadixPointer);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => reportError }));
const refetch = vi.fn(() => Promise.resolve());
const listQuery = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/leads",
}));
vi.mock("@/lib/trpc-client", async () =>
  (await import("./inbox/leadsInboxTestMocks")).trpcMock(listQuery, [{ id: "u1", name: "Ada" }]),
);
vi.mock("./AddLeadModal", () => ({ AddLeadModal: () => null }));
vi.mock("@/features/identity/preferencesActions", () => ({ setLeadsViewAction: vi.fn() }));
const actions = vi.hoisted(() => ({
  archiveLeadAction: vi.fn(),
  bulkUpdateLeadsAction: vi.fn(),
  bulkConvertLeadsAction: vi.fn(),
  convertLeadAction: vi.fn(),
}));
vi.mock("./leadServerActions", () => actions);
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { LeadsInbox } from "./LeadsInbox";

function held(): { resolve: () => void; promise: Promise<unknown> } {
  let resolve: () => void = () => undefined;
  const promise = new Promise((r) => {
    resolve = () => r({ ok: true, value: { updated: 1, skipped: 0 } });
  });
  return { resolve, promise };
}

function bulkBar(): ReturnType<typeof within> {
  return within(screen.getByText("1 selected").parentElement as HTMLElement);
}

describe("LeadsInbox pending mutations", () => {
  it("disables the bulk Archive and Delete buttons while a bulk change is in flight", async () => {
    const run = held();
    actions.bulkUpdateLeadsAction.mockReturnValue(run.promise);
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1, refLabels: REF_LABELS }, refetch });
    render(<LeadsInbox />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme lead" }));
    const archive = bulkBar().getByRole("button", { name: "Archive" });
    fireEvent.click(archive);
    fireEvent.click(archive);
    expect(archive).toBeDisabled();
    expect(bulkBar().getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(actions.bulkUpdateLeadsAction).toHaveBeenCalledTimes(1);
    await act(async () => {
      run.resolve();
      await run.promise;
    });
  });

  it("disables a row's Archive item while that row's archive is in flight", async () => {
    const user = userEvent.setup();
    const run = held();
    actions.archiveLeadAction.mockReturnValue(run.promise);
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1, refLabels: REF_LABELS }, refetch });
    render(<LeadsInbox />);
    await user.click(screen.getByRole("button", { name: "Lead actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Lead actions" }));
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(actions.archiveLeadAction).toHaveBeenCalledTimes(1);
    await act(async () => {
      run.resolve();
      await run.promise;
    });
  });

  it("disables the bulk Change owner and Set label menus while a bulk change is in flight", async () => {
    const run = held();
    actions.bulkUpdateLeadsAction.mockReturnValue(run.promise);
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1, refLabels: REF_LABELS }, refetch });
    render(<LeadsInbox />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme lead" }));
    fireEvent.click(bulkBar().getByRole("button", { name: "Archive" }));
    expect(bulkBar().getByRole("button", { name: "Change owner" })).toBeDisabled();
    expect(bulkBar().getByRole("button", { name: "Set label" })).toBeDisabled();
    await act(async () => {
      run.resolve();
      await run.promise;
    });
  });

  it("disables every row action that edits through the bulk path while a bulk change runs", async () => {
    const user = userEvent.setup();
    const run = held();
    actions.bulkUpdateLeadsAction.mockReturnValue(run.promise);
    const other = { ...LEAD, id: "l2", title: "Other lead" };
    listQuery.mockReturnValue({
      data: { rows: [LEAD, other], total: 2, refLabels: REF_LABELS },
      refetch,
    });
    render(<LeadsInbox />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme lead" }));
    fireEvent.click(bulkBar().getByRole("button", { name: "Archive" }));
    const [, otherRowMenu] = screen.getAllByRole("button", { name: "Lead actions" });
    await user.click(otherRowMenu as HTMLElement);
    expect(screen.getByRole("menuitem", { name: "Change owner" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(actions.bulkUpdateLeadsAction).toHaveBeenCalledTimes(1);
    await act(async () => {
      run.resolve();
      await run.promise;
    });
  });

  it("reports and re-enables when a bulk change rejects", async () => {
    actions.bulkUpdateLeadsAction.mockRejectedValue(new Error("network"));
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1, refLabels: REF_LABELS }, refetch });
    render(<LeadsInbox />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme lead" }));
    fireEvent.click(bulkBar().getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    expect(bulkBar().getByRole("button", { name: "Archive" })).not.toBeDisabled();
  });
});
