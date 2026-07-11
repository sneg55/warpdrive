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
  },
}));

import { GlobalContactModal } from "./GlobalContactModal";

afterEach(() => {
  cleanup();
  createPersonAction.mockClear();
  createOrgAction.mockClear();
  routerPush.mockClear();
  routerRefresh.mockClear();
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
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/contacts/orgs/o1"));
  });

  it("just refreshes when the flag is off (default)", async () => {
    render(<GlobalContactModal kind="person" onClose={noop} onCreated={noop} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Roe" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe("GlobalContactModal person (rich create, M1)", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(createPersonAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Jane Roe",
        phones: [expect.objectContaining({ value: "555-0100" })],
      }),
      "tok",
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
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(createOrgAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Acme Inc",
        address: expect.objectContaining({ street: "1 Main St" }),
      }),
      "tok",
    );
  });
});
