import { describe, expect, test } from "vitest";
import { verifyTicket } from "@/server/ws/ticket";
import { mintTicketForActor } from "./realtime";

describe("realtime.ticket minting", () => {
  test("mints a verifiable ticket for an active actor with a live session", async () => {
    const r = await mintTicketForActor({
      userId: "u1",
      sessionId: "s1",
      isActive: true,
      sessionLive: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      const v = await verifyTicket(r.value.ticket);
      expect(v.ok).toBe(true);
      if (v.ok === true) {
        expect(v.value.userId).toBe("u1");
      }
    }
  });

  test("refuses a deactivated user", async () => {
    const r = await mintTicketForActor({
      userId: "u1",
      sessionId: "s1",
      isActive: false,
      sessionLive: true,
    });
    expect(r.ok).toBe(false);
  });

  test("refuses a dead session", async () => {
    const r = await mintTicketForActor({
      userId: "u1",
      sessionId: "s1",
      isActive: true,
      sessionLive: false,
    });
    expect(r.ok).toBe(false);
  });
});
