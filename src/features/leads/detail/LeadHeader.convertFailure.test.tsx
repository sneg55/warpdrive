// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadDetail } from "../leadRepo";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const STALE = new Error("Server Action was not found on the server");
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  unstable_isUnrecognizedActionError: (e: unknown) => e === STALE,
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const dealFieldDefs = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    customFields: {
      listDefs: {
        useQuery: ({ target }: { target: string }) => ({
          data: target === "deal" ? dealFieldDefs.current : [],
          isLoading: false,
        }),
      },
    },
    useUtils: () => ({ lead: { list: { invalidate: vi.fn(async () => {}) } } }),
  },
}));

type ConvertResult = { ok: true; value: { dealId: string } } | { ok: false; error: { id: string } };
const { convertLeadAction } = vi.hoisted(() => ({
  convertLeadAction: vi.fn<() => Promise<ConvertResult>>(),
}));
const { bulkUpdateLeadsAction } = vi.hoisted(() => ({ bulkUpdateLeadsAction: vi.fn() }));
vi.mock("../leadServerActions", () => ({
  convertLeadAction,
  archiveLeadAction: vi.fn(),
  bulkUpdateLeadsAction,
  updateLeadAction: vi.fn(),
}));

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => reportError }));
vi.mock("@/features/labels/useLabelChipResolver", () => ({
  useLabelChipResolver: () => () => [],
}));

import { LeadHeader } from "./LeadHeader";

const LEAD = {
  id: "l1",
  title: "Acme lead",
  labels: [],
  ownerName: "Nick",
  archivedAt: null,
  convertedDealId: null,
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  customFields: {},
} as unknown as LeadDetail;

const GRADE_DEF = {
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

beforeEach(() => {
  dealFieldDefs.current = [];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("LeadHeader convert without a dialog", () => {
  it("reports an unconfirmed outcome when the action rejects, and re-enables the button", async () => {
    convertLeadAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<LeadHeader lead={LEAD} />);

    await userEvent.click(screen.getByRole("button", { name: "Convert to deal" }));

    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_UI_003"));
    expect(screen.getByRole("button", { name: "Convert to deal" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("reports a stale build when the action is missing from the running build", async () => {
    convertLeadAction.mockRejectedValueOnce(STALE);
    render(<LeadHeader lead={LEAD} />);

    await userEvent.click(screen.getByRole("button", { name: "Convert to deal" }));

    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_UI_002"));
    expect(screen.getByRole("button", { name: "Convert to deal" })).toBeEnabled();
  });

  it("reports a returned write failure", async () => {
    convertLeadAction.mockResolvedValueOnce({ ok: false, error: { id: "E_DB_003" } });
    render(<LeadHeader lead={LEAD} />);

    await userEvent.click(screen.getByRole("button", { name: "Convert to deal" }));

    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_DB_003"));
    expect(screen.getByRole("button", { name: "Convert to deal" })).toBeEnabled();
  });
});

describe("LeadHeader convert through the dialog", () => {
  beforeEach(() => {
    dealFieldDefs.current = [GRADE_DEF];
  });

  async function openAndFill(): Promise<void> {
    render(<LeadHeader lead={LEAD} />);
    await userEvent.click(screen.getByRole("button", { name: "Convert to deal" }));
    fireEvent.change(await screen.findByLabelText("Grade"), { target: { value: "A" } });
  }

  it("shows a rejected action inside the dialog, keeps the typed value, and retries", async () => {
    convertLeadAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    convertLeadAction.mockResolvedValueOnce({ ok: true, value: { dealId: "d9" } });
    await openAndFill();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("E_UI_003");
    expect(alert).toHaveTextContent(/could not confirm the lead was converted/i);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByLabelText("Grade")).toHaveValue("A");
    expect(reportError).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/deals/d9"));
  });

  it("shows a returned error inside the dialog", async () => {
    convertLeadAction.mockResolvedValueOnce({ ok: false, error: { id: "E_DB_003" } });
    await openAndFill();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("E_DB_003");
    expect(screen.getByLabelText("Grade")).toHaveValue("A");
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe("LeadHeader convert dialog dismissed before the result arrives", () => {
  it("reports the failure through the shared error reporter", async () => {
    dealFieldDefs.current = [GRADE_DEF];
    let fail: () => void = () => undefined;
    convertLeadAction.mockReturnValueOnce(
      new Promise((resolve) => {
        fail = () => resolve({ ok: false, error: { id: "E_DB_003" } });
      }),
    );
    render(<LeadHeader lead={LEAD} />);
    await userEvent.click(screen.getByRole("button", { name: "Convert to deal" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(convertLeadAction).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fail();
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_DB_003"));
  });
});

describe("LeadHeader delete rejection", () => {
  it("reports an unconfirmed outcome when the delete action rejects", async () => {
    bulkUpdateLeadsAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<LeadHeader lead={LEAD} />);
    await userEvent.click(screen.getByRole("button", { name: "More lead actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete lead" }));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_UI_003"));
    expect(push).not.toHaveBeenCalled();
  });
});
