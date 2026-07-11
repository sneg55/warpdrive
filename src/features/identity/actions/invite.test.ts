import { describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok } from "@/types/result";

// IDENTITY-02: the action must return a PLAIN, serializable shape. An AppError instance's
// custom `id` is stripped by React Flight (and by structuredClone), so the client would read
// `undefined` and collapse every invite error to a generic message. These tests drive the
// action with the service/context/csrf mocked so we can assert the returned shape directly.

const { guardCsrf } = vi.hoisted(() => ({ guardCsrf: vi.fn(() => Promise.resolve(ok(true))) }));
const { createContext } = vi.hoisted(() => ({
  createContext: vi.fn(() => Promise.resolve({ actor: { id: "admin-1", type: "admin" } })),
}));
const { inviteUser } = vi.hoisted(() => ({ inviteUser: vi.fn() }));

vi.mock("./shared", () => ({ guardCsrf }));
vi.mock("@/server/trpc/context", () => ({ createContext }));
vi.mock("../invite.service", () => ({ inviteUser }));

import { inviteUserAction } from "./invite";

const VALID_INPUT = { email: "new@example.com", name: "New Person", isAdmin: false };

describe("inviteUserAction serialization (IDENTITY-02)", () => {
  it("returns a plain { error: { id } } (not an AppError) that survives structuredClone", async () => {
    inviteUser.mockResolvedValueOnce(
      err(new AppError(ERROR_IDS.AUTH_EMAIL_TAKEN, "email already registered", { email: "x" })),
    );

    const result = await inviteUserAction("csrf", VALID_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The specific id, not a leaked AppError instance.
    expect(result.error).toEqual({ id: ERROR_IDS.AUTH_EMAIL_TAKEN });
    expect(result.error instanceof AppError).toBe(false);
    // The proof the client actually cares about: the id survives serialization.
    const cloned = structuredClone(result);
    expect(cloned.ok).toBe(false);
    if (!cloned.ok) expect(cloned.error.id).toBe(ERROR_IDS.AUTH_EMAIL_TAKEN);
  });

  it("preserves distinct ids per branch (invalid input, csrf failure)", async () => {
    const bad = await inviteUserAction("csrf", { email: "not-an-email", name: "", isAdmin: false });
    expect(bad.ok === false && bad.error.id).toBe(ERROR_IDS.AUTH_INVITE_INPUT_INVALID);

    guardCsrf.mockResolvedValueOnce(err("csrf") as never);
    const denied = await inviteUserAction(null, VALID_INPUT);
    expect(denied.ok === false && denied.error.id).toBe(ERROR_IDS.PERM_DENIED);
  });

  it("passes the created userId through on success", async () => {
    inviteUser.mockResolvedValueOnce(ok({ userId: "u-123" }));
    const result = await inviteUserAction("csrf", VALID_INPUT);
    expect(result.ok === true && result.userId).toBe("u-123");
  });
});
