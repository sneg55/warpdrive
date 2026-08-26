import { describe, expect, it } from "vitest";
import type { NotificationType } from "@/constants/notificationTypes";
import { NOTIFICATION_TYPES } from "@/constants/notificationTypes";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getPreferences, resolveDelivery, setPreference } from "./preferences";

// Expected email default per type, written out literally rather than imported from the
// constant it guards: importing DEFAULT_EMAIL_BY_TYPE here would make the test tautological.
// High-signal, low-volume types are on; per-event and per-edit firehoses are off.
const EXPECTED_EMAIL_DEFAULT: Record<NotificationType, boolean> = {
  mention: true,
  comment_reply: true,
  activity_assigned: true,
  activity_reminder: true,
  deal_won: true,
  deal_lost: true,
  deal_followed_update: false,
  email_open: false,
  email_click: false,
  deal_email_received: false,
};

describe("notification preferences", () => {
  it("defaults to inApp=true for every type, with email on per DEFAULT_EMAIL_BY_TYPE", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const sig = new AbortController().signal;

      const prefs = await getPreferences(db, alice.id, sig);

      // All types must be present.
      for (const t of NOTIFICATION_TYPES) {
        expect(prefs[t], `missing key: ${t}`).toBeDefined();
      }

      for (const t of NOTIFICATION_TYPES) {
        expect(prefs[t], `wrong default for ${t}`).toEqual({
          inApp: true,
          email: EXPECTED_EMAIL_DEFAULT[t],
        });
      }
    });
  });

  it("every notification type has an explicit email default (no type falls through)", () => {
    for (const t of NOTIFICATION_TYPES) {
      expect(EXPECTED_EMAIL_DEFAULT[t], `no expectation recorded for ${t}`).toBeTypeOf("boolean");
    }
  });

  it("setPreference then getPreferences round-trips a changed value", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const sig = new AbortController().signal;

      await setPreference(db, alice.id, "mention", { inApp: false, email: true }, sig);

      const prefs = await getPreferences(db, alice.id, sig);
      expect(prefs.mention).toEqual({ inApp: false, email: true });
      // Other types should still be defaults.
      expect(prefs.activity_reminder).toEqual({ inApp: true, email: true });
    });
  });

  it("setPreference is an upsert: calling it twice for the same (user, type) updates rather than erroring", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const sig = new AbortController().signal;

      await setPreference(db, alice.id, "deal_won", { inApp: true, email: true }, sig);
      // Second call for same (user, type): must not throw.
      await setPreference(db, alice.id, "deal_won", { inApp: false, email: false }, sig);

      const prefs = await getPreferences(db, alice.id, sig);
      expect(prefs.deal_won).toEqual({ inApp: false, email: false });
    });
  });

  it("resolveDelivery returns the stored row when present", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const sig = new AbortController().signal;

      await setPreference(db, alice.id, "email_open", { inApp: false, email: true }, sig);
      const result = await resolveDelivery(db, alice.id, "email_open", sig);
      expect(result).toEqual({ inApp: false, email: true });
    });
  });

  it("resolveDelivery returns the per-type default when no row exists", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const sig = new AbortController().signal;

      // An on-by-default type and an off-by-default type, so a single blanket
      // default cannot satisfy both.
      expect(await resolveDelivery(db, alice.id, "comment_reply", sig)).toEqual({
        inApp: true,
        email: true,
      });
      expect(await resolveDelivery(db, alice.id, "email_open", sig)).toEqual({
        inApp: true,
        email: false,
      });
    });
  });

  it("an explicit opt-out beats an on-by-default type", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const sig = new AbortController().signal;

      await setPreference(db, alice.id, "mention", { inApp: true, email: false }, sig);

      expect(await resolveDelivery(db, alice.id, "mention", sig)).toEqual({
        inApp: true,
        email: false,
      });
    });
  });
});
