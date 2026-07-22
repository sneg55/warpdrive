// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
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
  customFieldDefs.splice(0);
});

const { customFieldDefs } = vi.hoisted(() => ({
  customFieldDefs: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: {
      personOptions: { useQuery: () => ({ data: [{ id: "pe1", name: "Jane Roe" }] }) },
      orgOptions: { useQuery: () => ({ data: [{ id: "or1", name: "Acme Inc" }] }) },
    },
    identity: {
      listUsers: { useQuery: () => ({ data: undefined }) },
      listVisibilityGroups: { useQuery: () => ({ data: undefined }) },
    },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    customFields: {
      listDefs: {
        useQuery: ({ target }: { target: string }) => ({
          data: customFieldDefs.filter((def) => def.targetEntity === target),
        }),
      },
    },
  },
}));

const { createLeadAction } = vi.hoisted(() => ({
  createLeadAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "l1" } })),
}));
const { createPersonAction, createOrgAction } = vi.hoisted(() => ({
  createPersonAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "pnew" } })),
  createOrgAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "onew" } })),
}));
vi.mock("./leadServerActions", () => ({ createLeadAction }));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction, createOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush, refresh: vi.fn() }) }));

import { TITLE_MAX_LEN } from "@/constants/fieldLimits";
import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";
import { AddLeadModal } from "./AddLeadModal";

describe("AddLeadModal", () => {
  it("renders the two-column layout without pipeline/stage fields", () => {
    render(<AddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Add lead" })).toBeInTheDocument();
    expect(screen.getByLabelText("Contact person")).toBeInTheDocument();
    expect(screen.getByLabelText("Lead title")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone 1")).toBeInTheDocument();
    // Leads have no pipeline / stage.
    expect(screen.queryByLabelText("Pipeline")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Pipeline stage" })).toBeNull();
  });

  it("submits a parsed lead via createLeadAction", async () => {
    const onCreated = vi.fn();
    render(<AddLeadModal onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Lead title"), { target: { value: "New lead" } });
    expect(screen.getByText(`8/${TITLE_MAX_LEN}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createLeadAction).toHaveBeenCalledWith(
        expect.objectContaining({ title: "New lead", sourceOrigin: "manually_created" }),
        expect.anything(),
      ),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("uses person add-form fields when a lead creates a person inline", async () => {
    customFieldDefs.push({
      id: "11111111-1111-1111-1111-111111111111",
      targetEntity: "person",
      type: "text",
      name: "Role",
      key: "role",
      options: [],
      isRequired: false,
      isImportant: false,
      showInAddForm: true,
      order: 0,
      archivedAt: null,
    });
    render(<AddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Contact person"), {
      target: { value: "New Contact" },
    });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Buyer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createPersonAction).toHaveBeenCalledWith(
        expect.objectContaining({ customFields: { role: "Buyer" } }),
        "csrf",
      ),
    );
  });

  it("picks the expected close date via the DatePicker and submits it as YYYY-MM-DD", async () => {
    const onCreated = vi.fn();
    render(<AddLeadModal onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Lead title"), { target: { value: "New lead" } });
    fireEvent.click(screen.getByLabelText("Expected close date"));
    // findByText: the calendar is a next/dynamic chunk that loads on open.
    fireEvent.click(await screen.findByText("15"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createLeadAction).toHaveBeenCalledWith(
        expect.objectContaining({ expectedCloseDate: expect.stringMatching(/-15$/) }),
        expect.anything(),
      ),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("blocks an empty-title submit with an inline error", async () => {
    render(<AddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/title/i);
    expect(createLeadAction).not.toHaveBeenCalled();
  });

  it("does not create an inline org/person when the lead is invalid (no orphans)", async () => {
    render(<AddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Brand New Org" } });
    fireEvent.blur(screen.getByLabelText("Organization"));
    // The org autofills the title; clear it so the lead is invalid (blank title) again.
    fireEvent.change(screen.getByLabelText("Lead title"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/title/i);
    expect(createOrgAction).not.toHaveBeenCalled();
    expect(createPersonAction).not.toHaveBeenCalled();
    expect(createLeadAction).not.toHaveBeenCalled();
  });

  it("prefills '{org} lead' when the auto-prefix preference is on", () => {
    render(
      <InterfacePrefsProvider
        value={{ ...INTERFACE_PREFS_DEFAULT, autoPrefixLeadDealTitles: true }}
      >
        <AddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />
      </InterfacePrefsProvider>,
    );
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Acme Corp" } });
    fireEvent.blur(screen.getByLabelText("Organization"));
    expect(screen.getByLabelText<HTMLInputElement>("Lead title").value).toBe("Acme Corp lead");
  });

  it("prefills just the name when the auto-prefix preference is off (default)", () => {
    render(<AddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Acme Corp" } });
    fireEvent.blur(screen.getByLabelText("Organization"));
    expect(screen.getByLabelText<HTMLInputElement>("Lead title").value).toBe("Acme Corp");
  });

  it("navigates to the new lead after create when the open-details leadDeal flag is on", async () => {
    render(
      <InterfacePrefsProvider
        value={{
          ...INTERFACE_PREFS_DEFAULT,
          openDetailsAfterCreate: { leadDeal: true, person: false, org: false },
        }}
      >
        <AddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />
      </InterfacePrefsProvider>,
    );
    fireEvent.change(screen.getByLabelText("Lead title"), { target: { value: "Big lead" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/leads/l1"));
  });
});
