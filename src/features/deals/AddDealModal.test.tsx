// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// tRPC hooks the modal reads. listUsers / listVisibilityGroups return empty so the manager-only
// fields stay hidden (the 403 path).
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: {
      personOptions: { useQuery: () => ({ data: [{ id: "pe1", name: "Jane Roe" }] }) },
      orgOptions: { useQuery: () => ({ data: [{ id: "or1", name: "Acme Inc" }] }) },
    },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    identity: {
      listUsers: { useQuery: () => ({ data: undefined }) },
      listVisibilityGroups: { useQuery: () => ({ data: undefined }) },
    },
  },
}));

const { createDealAction } = vi.hoisted(() => ({
  createDealAction: vi.fn(() =>
    Promise.resolve({ ok: true as const, deal: { id: "d1", updatedAt: "x" } }),
  ),
}));
const { createPersonAction, createOrgAction } = vi.hoisted(() => ({
  createPersonAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "pnew" } })),
  createOrgAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "onew" } })),
}));
vi.mock("./createDealAction", () => ({ createDealAction }));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction, createOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush, refresh: vi.fn() }) }));

import { TITLE_MAX_LEN } from "@/constants/fieldLimits";
import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";
import { AddDealModal } from "./AddDealModal";

const PIPE = "11111111-1111-1111-1111-111111111111";
const STAGE_A = "22222222-2222-2222-2222-222222222222";
const STAGE_B = "33333333-3333-3333-3333-333333333333";

function renderModal(onCreated = vi.fn(), onClose = vi.fn(), autoPrefixLeadDealTitles = false) {
  const qc = new QueryClient();
  render(
    <InterfacePrefsProvider value={{ ...INTERFACE_PREFS_DEFAULT, autoPrefixLeadDealTitles }}>
      <QueryClientProvider client={qc}>
        <AddDealModal
          pipelineId={PIPE}
          pipelines={[
            {
              id: PIPE,
              name: "Sales",
              stages: [
                { id: STAGE_A, name: "Qualified" },
                { id: STAGE_B, name: "Proposal" },
              ],
            },
          ]}
          onClose={onClose}
          onCreated={onCreated}
        />
      </QueryClientProvider>
    </InterfacePrefsProvider>,
  );
  return { onCreated, onClose };
}

describe("AddDealModal", () => {
  it("renders the two-column Pipedrive layout with the key fields", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Add deal" })).toBeInTheDocument();
    expect(screen.getByLabelText("Contact person")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
    expect(screen.getByLabelText("Deal title")).toBeInTheDocument();
    expect(screen.getByLabelText("Pipeline")).toBeInTheDocument();
    // Stage chevron radios.
    expect(screen.getByRole("radio", { name: "Qualified" })).toBeInTheDocument();
    // Right column person contact rows.
    expect(screen.getByLabelText("Phone 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Email 1")).toBeInTheDocument();
    // Manager-only fields hidden (no users/groups).
    expect(screen.queryByLabelText("Owner")).toBeNull();
    expect(screen.queryByLabelText("Visible to")).toBeNull();
  });

  it("lets both grid columns shrink so the body never scrolls horizontally", () => {
    // The two-column body is a grid whose tracks default to minmax(auto, fr): without min-w-0
    // on each child, the columns refuse to shrink below their content and the dialog gets a
    // horizontal scrollbar (the PERSON column clipped past the right edge). min-w-0 lets the
    // fr tracks resolve to the container width. jsdom has no layout engine, so this asserts the
    // structural guard that the browser confirmed removes the overflow.
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Add deal" });
    const grid = dialog.querySelector<HTMLElement>(".grid");
    expect(grid).not.toBeNull();
    const columns = Array.from(grid?.children ?? []);
    expect(columns).toHaveLength(2);
    for (const col of columns) {
      expect(col).toHaveClass("min-w-0");
    }
  });

  it("submits the parsed deal (title + pipeline + first stage) via createDealAction", async () => {
    const { onCreated } = renderModal();
    fireEvent.change(screen.getByLabelText("Deal title"), { target: { value: "Big deal" } });
    expect(screen.getByText(`8/${TITLE_MAX_LEN}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createDealAction).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Big deal", pipelineId: PIPE, stageId: STAGE_A }),
        expect.anything(),
      ),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("navigates to the new deal after create when the open-details leadDeal flag is on", async () => {
    render(
      <InterfacePrefsProvider
        value={{
          ...INTERFACE_PREFS_DEFAULT,
          openDetailsAfterCreate: { leadDeal: true, person: false, org: false },
        }}
      >
        <QueryClientProvider client={new QueryClient()}>
          <AddDealModal
            pipelineId={PIPE}
            pipelines={[{ id: PIPE, name: "Sales", stages: [{ id: STAGE_A, name: "Qualified" }] }]}
            onClose={vi.fn()}
            onCreated={vi.fn()}
          />
        </QueryClientProvider>
      </InterfacePrefsProvider>,
    );
    fireEvent.change(screen.getByLabelText("Deal title"), { target: { value: "Big deal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/deals/d1"));
  });

  it("suppresses the open-details navigation when suppressDetailNav is set, even with the leadDeal flag on", async () => {
    const onCreated = vi.fn();
    render(
      <InterfacePrefsProvider
        value={{
          ...INTERFACE_PREFS_DEFAULT,
          openDetailsAfterCreate: { leadDeal: true, person: false, org: false },
        }}
      >
        <QueryClientProvider client={new QueryClient()}>
          <AddDealModal
            pipelineId={PIPE}
            pipelines={[{ id: PIPE, name: "Sales", stages: [{ id: STAGE_A, name: "Qualified" }] }]}
            onClose={vi.fn()}
            onCreated={onCreated}
            suppressDetailNav
          />
        </QueryClientProvider>
      </InterfacePrefsProvider>,
    );
    fireEvent.change(screen.getByLabelText("Deal title"), { target: { value: "Big deal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("d1", "Big deal"));
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("picks the expected close date via the DatePicker and submits it as YYYY-MM-DD", async () => {
    const { onCreated } = renderModal();
    fireEvent.change(screen.getByLabelText("Deal title"), { target: { value: "Big deal" } });
    fireEvent.click(screen.getByLabelText("Expected close date"));
    // findByText: the calendar is a next/dynamic chunk that loads on open.
    fireEvent.click(await screen.findByText("15"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createDealAction).toHaveBeenCalledWith(
        expect.objectContaining({ expectedCloseDate: expect.stringMatching(/-15$/) }),
        expect.anything(),
      ),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("blocks submit with an inline error when the title is empty", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/title/i);
    expect(createDealAction).not.toHaveBeenCalled();
  });

  it("does not create an inline org/person when the deal is invalid (no orphans)", async () => {
    renderModal();
    // Commit a brand-new org via the combobox (type + blur reconciles to create-new).
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Brand New Org" } });
    fireEvent.blur(screen.getByLabelText("Organization"));
    // The org autofills the title; clear it so the deal is invalid (blank title) again.
    fireEvent.change(screen.getByLabelText("Deal title"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/title/i);
    expect(createOrgAction).not.toHaveBeenCalled();
    expect(createPersonAction).not.toHaveBeenCalled();
    expect(createDealAction).not.toHaveBeenCalled();
  });

  it("autofills '{org} deal' when the auto-prefix preference is on", () => {
    renderModal(vi.fn(), vi.fn(), true);
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Acme Corp" } });
    fireEvent.blur(screen.getByLabelText("Organization"));
    expect(screen.getByLabelText<HTMLInputElement>("Deal title").value).toBe("Acme Corp deal");
  });

  it("autofills just the name when the auto-prefix preference is off (default)", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Acme Corp" } });
    fireEvent.blur(screen.getByLabelText("Organization"));
    expect(screen.getByLabelText<HTMLInputElement>("Deal title").value).toBe("Acme Corp");
  });

  it("links a newly-created person to the org chosen in the same modal (even without blurring first)", async () => {
    renderModal();
    // Type a new inline person + org and click Save WITHOUT blurring the fields first (the real
    // scenario: the combobox must commit the typed text on change, not only on blur, or the person
    // is created with no org).
    fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Acme Corp" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createPersonAction).toHaveBeenCalledTimes(1));
    // The created org's id ("onew") must be threaded into the person create so they are linked.
    expect(createPersonAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test User", orgId: "onew" }),
      "csrf",
    );
  });
});
