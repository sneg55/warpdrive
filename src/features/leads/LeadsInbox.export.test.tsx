// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD, REF_LABELS, stubRadixPointer } from "./inbox/leadsInboxTestMocks";

beforeAll(stubRadixPointer);

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
const anchorClick = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:leads");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = anchorClick;
  listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1, refLabels: REF_LABELS } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => vi.fn() }));
const listQuery = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/leads",
}));
vi.mock("@/lib/trpc-client", async () =>
  (await import("./inbox/leadsInboxTestMocks")).trpcMock(listQuery),
);
vi.mock("./AddLeadModal", () => ({ AddLeadModal: () => null }));
vi.mock("@/features/identity/preferencesActions", () => ({ setLeadsViewAction: vi.fn() }));
vi.mock("./leadServerActions", () => ({
  archiveLeadAction: vi.fn(),
  bulkUpdateLeadsAction: vi.fn(),
  bulkConvertLeadsAction: vi.fn(),
  convertLeadAction: vi.fn(),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { LeadsInbox } from "./LeadsInbox";

async function clickExport(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Export leads" }));
}

describe("LeadsInbox export", () => {
  it("shows that the export is under way and blocks a second export until it lands", async () => {
    const user = userEvent.setup();
    let land: (r: Response) => void = () => undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((r) => {
        land = r;
      }),
    );
    render(<LeadsInbox />);
    await clickExport(user);

    expect(screen.getByRole("status")).toHaveTextContent("Exporting leads...");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/leads\/export\?/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Exporting..." })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      land(new Response("Title\nAcme lead\n", { status: 200 }));
      await Promise.resolve();
    });
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Exporting leads...")).not.toBeInTheDocument();
  });

  it("says so in the bar when the export fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response("Export failed", { status: 500 }));
    render(<LeadsInbox />);
    await clickExport(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't export leads");
    expect(anchorClick).not.toHaveBeenCalled();
  });
});
