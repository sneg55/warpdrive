// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LEAD, REF_LABELS, stubRadixPointer } from "./inbox/leadsInboxTestMocks";

beforeAll(stubRadixPointer);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DEAL_FIELD = {
  id: "cf-grade",
  targetEntity: "deal",
  type: "text",
  name: "Grade",
  key: "grade",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: true,
  order: 0,
  archivedAt: null,
};

const refetch = vi.fn(() => Promise.resolve());
const listQuery = vi.hoisted(() => vi.fn());
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/leads",
}));
vi.mock("@/lib/trpc-client", async () => {
  const base = (await import("./inbox/leadsInboxTestMocks")).trpcMock(listQuery, []) as {
    trpc: Record<string, unknown>;
  };
  return {
    trpc: {
      ...base.trpc,
      customFields: { listDefs: { useQuery: () => ({ data: [DEAL_FIELD], isLoading: false }) } },
    },
  };
});
vi.mock("./AddLeadModal", () => ({ AddLeadModal: () => null }));
vi.mock("@/features/identity/preferencesActions", () => ({ setLeadsViewAction: vi.fn() }));
type ConvertResult = { ok: true; value: { dealId: string } } | { ok: false; error: { id: string } };
const actions = vi.hoisted(() => ({
  archiveLeadAction: vi.fn(),
  bulkUpdateLeadsAction: vi.fn(),
  bulkConvertLeadsAction: vi.fn(),
  convertLeadAction: vi.fn<() => Promise<ConvertResult>>(),
}));
vi.mock("./leadServerActions", () => actions);
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { LeadsInbox } from "./LeadsInbox";

describe("LeadsInbox convert dialog dismissed before the result arrives", () => {
  it("shows the failure in the inbox banner instead of losing it", async () => {
    let fail: () => void = () => undefined;
    actions.bulkConvertLeadsAction.mockReturnValue(
      new Promise((resolve) => {
        fail = () => resolve({ ok: false, error: { id: "E_DB_003" } });
      }),
    );
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1, refLabels: REF_LABELS }, refetch });
    render(<LeadsInbox baseCurrency="USD" />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme lead" }));
    fireEvent.click(screen.getByRole("button", { name: "Convert to deal" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.bulkConvertLeadsAction).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fail();
    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("E_DB_003");
  });
});
