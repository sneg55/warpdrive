import { afterEach, describe, expect, test, vi } from "vitest";
import { mintTicket, verifyTicket } from "./ticket";

describe("ws ticket", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("mint then verify round-trips identity", async () => {
    const token = await mintTicket({ userId: "u1", sessionId: "s1" });
    const r = await verifyTicket(token);
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.userId).toBe("u1");
      expect(r.value.sessionId).toBe("s1");
      expect(r.value.jti).toMatch(/[0-9a-f-]{36}/);
    }
  });

  test("a tampered token is rejected", async () => {
    const token = await mintTicket({ userId: "u1", sessionId: "s1" });
    const bad = `${token.slice(0, -2)}xx`;
    const r = await verifyTicket(bad);
    expect(r.ok).toBe(false);
  });

  test("an expired token is rejected", async () => {
    const token = await mintTicket({ userId: "u1", sessionId: "s1" });
    vi.setSystemTime(Date.now() + 61_000);
    const r = await verifyTicket(token);
    expect(r.ok).toBe(false);
  });
});
