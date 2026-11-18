import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialEntityCreateState } from "./modalState";

const { createPersonAction, createOrgAction } = vi.hoisted(() => ({
  createPersonAction: vi.fn(),
  createOrgAction: vi.fn(),
}));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction, createOrgAction }));

import { noInlineCreated, resolveNewOrgId, resolveNewPersonId } from "./modalHelpers";

const fresh = (): { current: ReturnType<typeof noInlineCreated> } => ({
  current: noInlineCreated(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveNewOrgId", () => {
  it("returns the selected id for an existing organization", async () => {
    const state = { ...initialEntityCreateState(), orgMode: "existing" as const, orgId: "or1" };
    expect(await resolveNewOrgId(state, "csrf", fresh())).toBe("or1");
    expect(createOrgAction).not.toHaveBeenCalled();
  });

  it("returns null when no organization is selected", async () => {
    const state = { ...initialEntityCreateState(), orgMode: "existing" as const, orgId: "" };
    expect(await resolveNewOrgId(state, "csrf", fresh())).toBeNull();
  });

  it("creates the organization inline and returns the new id", async () => {
    createOrgAction.mockResolvedValue({ ok: true, value: { id: "new-org" } });
    const state = {
      ...initialEntityCreateState(),
      orgMode: "new" as const,
      newOrgName: "  Acme  ",
    };
    expect(await resolveNewOrgId(state, "csrf", fresh())).toBe("new-org");
    expect(createOrgAction).toHaveBeenCalledWith(expect.objectContaining({ name: "Acme" }), "csrf");
  });

  it("surfaces an inline error when org creation fails", async () => {
    createOrgAction.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    const state = { ...initialEntityCreateState(), orgMode: "new" as const, newOrgName: "Acme" };
    expect(await resolveNewOrgId(state, "csrf", fresh())).toEqual({
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
    expect(await resolveNewPersonId(state, "resolved-org", "csrf", fresh())).toBe("new-person");
    expect(createPersonAction).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "resolved-org" }),
      "csrf",
    );
  });
});

describe("inline creates survive a failed save", () => {
  it("reuses the organization created by an earlier attempt instead of creating it again", async () => {
    createOrgAction.mockResolvedValue({ ok: true, value: { id: "org-1" } });
    const memo = fresh();
    const state = { ...initialEntityCreateState(), orgMode: "new" as const, newOrgName: "Acme" };
    expect(await resolveNewOrgId(state, "csrf", memo)).toBe("org-1");
    expect(await resolveNewOrgId(state, "csrf", memo)).toBe("org-1");
    expect(createOrgAction).toHaveBeenCalledTimes(1);
  });

  it("creates a new organization when the name changed between attempts", async () => {
    createOrgAction.mockResolvedValueOnce({ ok: true, value: { id: "org-1" } });
    createOrgAction.mockResolvedValueOnce({ ok: true, value: { id: "org-2" } });
    const memo = fresh();
    const state = { ...initialEntityCreateState(), orgMode: "new" as const, newOrgName: "Acme" };
    await resolveNewOrgId(state, "csrf", memo);
    expect(await resolveNewOrgId({ ...state, newOrgName: "Acme Ltd" }, "csrf", memo)).toBe("org-2");
    expect(createOrgAction).toHaveBeenCalledTimes(2);
  });

  it("reuses the person created by an earlier attempt for the same details and org", async () => {
    createPersonAction.mockResolvedValue({ ok: true, value: { id: "person-1" } });
    const memo = fresh();
    const state = {
      ...initialEntityCreateState(),
      personMode: "new" as const,
      newPersonName: "Jane",
    };
    expect(await resolveNewPersonId(state, "org-1", "csrf", memo)).toBe("person-1");
    expect(await resolveNewPersonId(state, "org-1", "csrf", memo)).toBe("person-1");
    expect(createPersonAction).toHaveBeenCalledTimes(1);
  });

  it("does not remember a failed create", async () => {
    createOrgAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    createOrgAction.mockResolvedValueOnce({ ok: true, value: { id: "org-1" } });
    const memo = fresh();
    const state = { ...initialEntityCreateState(), orgMode: "new" as const, newOrgName: "Acme" };
    await resolveNewOrgId(state, "csrf", memo);
    expect(await resolveNewOrgId(state, "csrf", memo)).toBe("org-1");
    expect(createOrgAction).toHaveBeenCalledTimes(2);
  });
});
