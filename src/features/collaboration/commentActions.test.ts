import { expect, it, vi } from "vitest";

vi.mock("@/features/identity/actions/shared", () => ({
  guardCsrf: () => Promise.resolve({ ok: false as const }),
}));

import { createCommentAction, deleteCommentAction, updateCommentAction } from "./commentActions";

it("createCommentAction rejects a bad CSRF token", async () => {
  const r = await createCommentAction({ noteId: "n1", body: "x" }, null);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe("E_AUTH_CSRF");
});

it("updateCommentAction rejects a bad CSRF token", async () => {
  const r = await updateCommentAction({ commentId: "c1", body: "x" }, null);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe("E_AUTH_CSRF");
});

it("deleteCommentAction rejects a bad CSRF token", async () => {
  const r = await deleteCommentAction({ commentId: "c1" }, null);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe("E_AUTH_CSRF");
});
