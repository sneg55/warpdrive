import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialEntityCreateState } from "./modalState";

const { createPersonAction, createOrgAction } = vi.hoisted(() => ({
  createPersonAction: vi.fn(),
  createOrgAction: vi.fn(),
}));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction, createOrgAction }));

import { resolveNewOrgId, resolveNewPersonId } from "./modalHelpers";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveNewOrgId", () => {
  it("returns the selected id for an existing organization", async () => {
    const state = { ...initialEntityCreateState(), orgMode: "existing" as const, orgId: "or1" };
    expect(await resolveNewOrgId(state, "csrf")).toBe("or1");
    expect(createOrgAction).not.toHaveBeenCalled();
  });

  it("returns null when no organization is selected", async () => {
    const state = { ...initialEntityCreateState(), orgMode: "existing" as const, orgId: "" };
    expect(await resolveNewOrgId(state, "csrf")).toBeNull();
  });

  it("creates the organization inline and returns the new id", async () => {
    createOrgAction.mockResolvedValue({ ok: true, value: { id: "new-org" } });
    const state = {
      ...initialEntityCreateState(),
      orgMode: "new" as const,
      newOrgName: "  Acme  ",
    };
    expect(await resolveNewOrgId(state, "csrf")).toBe("new-org");
    expect(createOrgAction).toHaveBeenCalledWith(expect.objectContaining({ name: "Acme" }), "csrf");
  });

  it("surfaces an inline error when org creation fails", async () => {
    createOrgAction.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    const state = { ...initialEntityCreateState(), orgMode: "new" as const, newOrgName: "Acme" };
    expect(await resolveNewOrgId(state, "csrf")).toEqual({
      error: "Could not create organization (E_PERM_001)",
    });
  });
});

describe("resolveNewPersonId", () => {
  it("links a newly created person to the resolved org id (not the raw state)", async () => {
    createPersonAction.mockResolvedValue({ ok: true, value: { id: "new-person" } });
    const state = {
      ...initialEntityCreateState(),
      personMode: "new" as const,
      newPersonName: "Jane",
      orgId: "",
    };
    expect(await resolveNewPersonId(state, "resolved-org", "csrf")).toBe("new-person");
    expect(createPersonAction).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "resolved-org" }),
      "csrf",
    );
  });
});
