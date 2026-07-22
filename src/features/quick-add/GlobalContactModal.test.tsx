// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";

// Radix Select (the Organization picker) needs these jsdom polyfills.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const { createPersonAction, createOrgAction } = vi.hoisted(() => ({
  createPersonAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "p1" } })),
  createOrgAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "o1" } })),
}));
const { customFieldDefs, customFieldsQuery } = vi.hoisted(() => ({
  customFieldDefs: [] as Array<Record<string, unknown>>,
  customFieldsQuery: { isLoading: false },
}));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction, createOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));
const { routerPush, routerRefresh } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: {
      orgOptions: {
        useQuery: () => ({ data: [{ id: "o1", name: "Acme" }] }),
      },
    },
    customFields: {
      listDefs: {
        useQuery: ({ target }: { target: string }) => ({
          data: customFieldDefs.filter((def) => def.targetEntity === target),
          isLoading: customFieldsQuery.isLoading,
        }),
      },
    },
  },
}));

import { GlobalContactModal } from "./GlobalContactModal";

afterEach(() => {
  cleanup();
  createPersonAction.mockClear();
  createOrgAction.mockClear();
  routerPush.mockClear();
  routerRefresh.mockClear();
  customFieldDefs.splice(0);
  customFieldsQuery.isLoading = false;
  createPersonAction.mockImplementation(() =>
    Promise.resolve({ ok: true as const, value: { id: "p1" } }),
  );
  createOrgAction.mockImplementation(() =>
    Promise.resolve({ ok: true as const, value: { id: "o1" } }),
  );
});

const noop = (): void => {};

function withOpenDetails(
  node: React.ReactNode,
  overrides: Partial<typeof INTERFACE_PREFS_DEFAULT.openDetailsAfterCreate>,
): React.ReactNode {
  return (
    <InterfacePrefsProvider
      value={{
        ...INTERFACE_PREFS_DEFAULT,
        openDetailsAfterCreate: { ...INTERFACE_PREFS_DEFAULT.openDetailsAfterCreate, ...overrides },
      }}
    >
      {node}
    </InterfacePrefsProvider>
  );
}

describe("GlobalContactModal open-details-after-create", () => {
  it("navigates to the new person when the person flag is on", async () => {
    render(
      withOpenDetails(<GlobalContactModal kind="person" onClose={noop} onCreated={noop} />, {
        person: true,
      }),
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Roe" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/contacts/people/p1"));
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("navigates to the new org when the org flag is on", async () => {
    render(
      withOpenDetails(<GlobalContactModal kind="org" onClose={noop} onCreated={noop} />, {
        org: true,
      }),
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme Inc" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/contacts/orgs/o1"));
  });

  it("just refreshes when the flag is off (default)", async () => {
    render(<GlobalContactModal kind="person" onClose={noop} onCreated={noop} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Roe" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe("GlobalContactModal person (rich create, M1)", () => {
  it("does not submit from Enter while custom fields are still loading", () => {
    customFieldsQuery.isLoading = true;
    render(<GlobalContactModal kind="person" onClose={noop} onCreated={noop} />);
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "Jane Roe" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(createPersonAction).not.toHaveBeenCalled();
  });

  it("guards rapid Enter presses from creating the same person twice", () => {
    createPersonAction.mockImplementation(() => new Promise(() => undefined));
    render(<GlobalContactModal kind="person" onClose={noop} onCreated={noop} />);
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "Jane Roe" } });
    fireEvent.keyDown(name, { key: "Enter" });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(createPersonAction).toHaveBeenCalledTimes(1);
  });

  it("uses the same full-width entity-create shell as Add lead", () => {
    render(<GlobalContactModal kind="person" onClose={noop} onCreated={noop} />);
    expect(screen.getByRole("heading", { name: "Add person" })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveClass("max-w-3xl", "p-0");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("offers Organization, Phone, and Email at create time, not name-only", () => {
    render(<GlobalContactModal kind="person" onClose={noop} onCreated={noop} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add phone" })).toBeInTheDocument();
  });

  it("submits a phone entered in the create modal", () => {
    render(<GlobalContactModal kind="person" onClose={noop} onCreated={noop} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Roe" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add phone" }));
    fireEvent.change(screen.getByLabelText("Phone 1"), { target: { value: "555-0100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(createPersonAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Jane Roe",
        phones: [expect.objectContaining({ value: "555-0100" })],
      }),
      "tok",
    );
  });

  it("shows add-form custom fields, requires Important, and submits their values", async () => {
    customFieldDefs.push(
      {
        id: "11111111-1111-1111-1111-111111111111",
        targetEntity: "person",
        type: "text",
        name: "Seniority",
        key: "seniority",
        options: [],
        isRequired: false,
        isImportant: true,
        showInAddForm: false,
        order: 0,
        archivedAt: null,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        targetEntity: "person",
        type: "text",
        name: "Internal only",
        key: "internal_only",
        options: [],
        isRequired: false,
        isImportant: false,
        showInAddForm: false,
        order: 1,
        archivedAt: null,
      },
    );
    render(<GlobalContactModal kind="person" onClose={noop} onCreated={noop} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Roe" } });

    expect(screen.getByLabelText("Seniority")).toBeInTheDocument();
    expect(screen.queryByLabelText("Internal only")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Seniority is required");
    expect(createPersonAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Seniority"), { target: { value: "Director" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createPersonAction).toHaveBeenCalledWith(
        expect.objectContaining({ customFields: { seniority: "Director" } }),
        "tok",
      ),
    );
  });
});

describe("GlobalContactModal organization (rich create, M1)", () => {
  it("offers an Address field at create time", () => {
    render(<GlobalContactModal kind="org" onClose={noop} onCreated={noop} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Street")).toBeInTheDocument();
  });

  it("submits the address entered in the create modal", () => {
    render(<GlobalContactModal kind="org" onClose={noop} onCreated={noop} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme Inc" } });
    fireEvent.change(screen.getByLabelText("Street"), { target: { value: "1 Main St" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(createOrgAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Acme Inc",
        address: expect.objectContaining({ street: "1 Main St" }),
      }),
      "tok",
    );
  });
});
