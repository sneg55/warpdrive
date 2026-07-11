// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // The org Combobox uses cmdk/Radix pieces that reach for browser APIs jsdom lacks.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type ActionResult = { ok: true } | { ok: false; error: { id: string } };

const { addOrgRelationAction, removeOrgRelationAction } = vi.hoisted(() => ({
  addOrgRelationAction: vi.fn((): Promise<ActionResult> => Promise.resolve({ ok: true })),
  removeOrgRelationAction: vi.fn((): Promise<ActionResult> => Promise.resolve({ ok: true })),
}));
vi.mock("@/features/contacts/orgRelationActions", () => ({
  addOrgRelationAction,
  removeOrgRelationAction,
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-tok" }));

import { RelatedOrgsPanel } from "./RelatedOrgsPanel";

const orgOptions = [
  { id: "o1", name: "Acme" },
  { id: "o2", name: "Beta Co" },
  { id: "o3", name: "Gamma" },
];
const related = [{ orgId: "o2", name: "Beta Co", relationType: "partner" }];

describe("RelatedOrgsPanel", () => {
  it("renders related org rows with their relation type", () => {
    render(
      <RelatedOrgsPanel orgId="o1" related={related} orgOptions={orgOptions} onChanged={vi.fn()} />,
    );
    expect(screen.getByText("Beta Co")).toBeInTheDocument();
    expect(screen.getByText("partner")).toBeInTheDocument();
  });

  it("shows an empty state when there are no related orgs", () => {
    render(
      <RelatedOrgsPanel orgId="o1" related={[]} orgOptions={orgOptions} onChanged={vi.fn()} />,
    );
    expect(screen.getByText(/no related organizations yet/i)).toBeInTheDocument();
  });

  it("excludes the current org and already-related orgs from the picker", () => {
    render(
      <RelatedOrgsPanel orgId="o1" related={related} orgOptions={orgOptions} onChanged={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Related organization"));
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Beta Co" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gamma" })).toBeInTheDocument();
  });

  it("adds a related org via the combobox + relation-type input", async () => {
    const onChanged = vi.fn();
    render(
      <RelatedOrgsPanel
        orgId="o1"
        related={related}
        orgOptions={orgOptions}
        onChanged={onChanged}
      />,
    );
    fireEvent.click(screen.getByLabelText("Related organization"));
    fireEvent.click(screen.getByRole("option", { name: "Gamma" }));
    fireEvent.change(screen.getByLabelText("Relation type"), { target: { value: "subsidiary" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await vi.waitFor(() => expect(addOrgRelationAction).toHaveBeenCalled());
    expect(addOrgRelationAction).toHaveBeenCalledWith(
      { sourceOrgId: "o1", targetOrgId: "o3", relationType: "subsidiary" },
      "csrf-tok",
    );
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("the Add button stays disabled until both an org and a relation type are set", () => {
    render(
      <RelatedOrgsPanel orgId="o1" related={related} orgOptions={orgOptions} onChanged={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("removes a related org via its Remove button", async () => {
    const onChanged = vi.fn();
    render(
      <RelatedOrgsPanel
        orgId="o1"
        related={related}
        orgOptions={orgOptions}
        onChanged={onChanged}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Beta Co" }));

    await vi.waitFor(() => expect(removeOrgRelationAction).toHaveBeenCalled());
    expect(removeOrgRelationAction).toHaveBeenCalledWith(
      { sourceOrgId: "o1", targetOrgId: "o2" },
      "csrf-tok",
    );
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("surfaces an add failure inline", async () => {
    addOrgRelationAction.mockResolvedValueOnce({ ok: false, error: { id: "E_CONTACT_005" } });
    render(
      <RelatedOrgsPanel orgId="o1" related={related} orgOptions={orgOptions} onChanged={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Related organization"));
    fireEvent.click(screen.getByRole("option", { name: "Gamma" }));
    fireEvent.change(screen.getByLabelText("Relation type"), { target: { value: "subsidiary" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText(/couldn.t add/i)).toBeInTheDocument();
  });
});
