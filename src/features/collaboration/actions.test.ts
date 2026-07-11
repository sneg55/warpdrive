import { expect, it, vi } from "vitest";

vi.mock("@/features/identity/actions/shared", () => ({
  guardCsrf: () => Promise.resolve({ ok: false as const }),
}));

import { deleteNoteAction, updateNoteAction } from "./actions";

it("updateNoteAction rejects a bad CSRF token", async () => {
  const r = await updateNoteAction({ noteId: "n1", body: "x" }, null);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe("E_AUTH_CSRF");
});

it("deleteNoteAction rejects a bad CSRF token", async () => {
  const r = await deleteNoteAction({ noteId: "n1" }, null);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe("E_AUTH_CSRF");
});
