import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/identity/actions/shared", () => ({
  guardCsrf: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn(() => Promise.resolve({ actor: { id: "u1", flags: new Set<string>() } })),
}));
vi.mock("./authoring", () => ({
  updateTemplate: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  deleteTemplate: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  updateSignature: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  deleteSignature: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  createTemplate: vi.fn(() => Promise.resolve({ ok: true, value: { id: "t1" } })),
  createSignature: vi.fn(() => Promise.resolve({ ok: true, value: { id: "s1" } })),
  setDefaultSignature: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  reorderTemplates: vi.fn(() => Promise.resolve({ ok: true, value: { reordered: 0 } })),
  deleteTemplates: vi.fn(() => Promise.resolve({ ok: true, value: { deleted: 0 } })),
}));

import { createContext } from "@/server/trpc/context";
import * as authoring from "./authoring";
import {
  createSignatureAction,
  createTemplateAction,
  deleteTemplateAction,
  deleteTemplatesAction,
  reorderTemplatesAction,
  updateSignatureAction,
  updateTemplateAction,
} from "./authoringActions";

const createTemplate = vi.mocked(authoring.createTemplate);
const updateTemplate = vi.mocked(authoring.updateTemplate);
const deleteTemplate = vi.mocked(authoring.deleteTemplate);
const updateSignature = vi.mocked(authoring.updateSignature);
const createSignature = vi.mocked(authoring.createSignature);
const reorderTemplates = vi.mocked(authoring.reorderTemplates);
const deleteTemplates = vi.mocked(authoring.deleteTemplates);

describe("template mutation actions", () => {
  it("updateTemplateAction rejects invalid id (E_GMAIL_010) before calling repo", async () => {
    const r = await updateTemplateAction("csrf", { id: "not-a-uuid", patch: {} });
    expect(r.ok).toBe(false);
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it("an admin without an explicit filter.share flag can still share a template", async () => {
    // Admins carry an empty flags Set (hydrateActor only populates flags for non-admins), so a
    // bare flags.has('filter.share') check would wrongly deny them. canShare must honor admin.
    vi.mocked(createContext).mockResolvedValueOnce({
      actor: { id: "admin1", type: "admin", flags: new Set<string>() },
    } as never);
    const r = await createTemplateAction("csrf", {
      name: "T",
      bodyHtml: "<p>x</p>",
      isShared: true,
    });
    expect(r.ok).toBe(true);
    expect(createTemplate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ canShare: true }),
      expect.anything(),
    );
  });

  it("deleteTemplateAction passes the trusted actor id, not client input", async () => {
    const r = await deleteTemplateAction("csrf", {
      id: "11111111-1111-4111-8111-111111111111",
      actorId: "attacker",
    });
    expect(r.ok).toBe(true);
    expect(deleteTemplate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: "u1" }),
      expect.anything(),
    );
  });

  it("reorderTemplatesAction passes the trusted actor id and validated ids", async () => {
    const r = await reorderTemplatesAction("csrf", {
      orderedIds: ["11111111-1111-4111-8111-111111111111"],
    });
    expect(r.ok).toBe(true);
    expect(reorderTemplates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: "u1" }),
      expect.anything(),
    );
  });

  it("deleteTemplatesAction rejects a non-uuid id before touching the repo", async () => {
    const r = await deleteTemplatesAction("csrf", { ids: ["nope"] });
    expect(r.ok).toBe(false);
    expect(deleteTemplates).not.toHaveBeenCalled();
  });

  it("deleteTemplatesAction rejects an over-limit id array (bulk DoS bound)", async () => {
    const many = Array.from(
      { length: 501 },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
    );
    const r = await deleteTemplatesAction("csrf", { ids: many });
    expect(r.ok).toBe(false);
    expect(deleteTemplates).not.toHaveBeenCalled();
  });

  it("reorderTemplatesAction deduplicates repeated ids before the repo call", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const r = await reorderTemplatesAction("csrf", { orderedIds: [id, id, id] });
    expect(r.ok).toBe(true);
    expect(reorderTemplates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderedIds: [id] }),
      expect.anything(),
    );
  });
});

describe("signature name length (S1)", () => {
  it("createSignatureAction rejects a name longer than 40 chars", async () => {
    const r = await createSignatureAction("csrf", {
      name: "x".repeat(41),
      bodyHtml: "<p>s</p>",
      isDefault: false,
    });
    expect(r.ok).toBe(false);
    expect(createSignature).not.toHaveBeenCalled();
  });

  it("updateSignatureAction still accepts a legacy name longer than 40 chars (no edit lockout)", async () => {
    // A signature created before the S1 cap can have a >40-char name; a body-only edit resends that
    // name in the patch and must not be rejected, or the user could never edit the signature again.
    const r = await updateSignatureAction("csrf", {
      id: "22222222-2222-4222-8222-222222222222",
      patch: { name: "y".repeat(60), bodyHtml: "<p>new</p>" },
    });
    expect(r.ok).toBe(true);
    expect(updateSignature).toHaveBeenCalled();
  });
});
