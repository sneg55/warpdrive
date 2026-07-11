import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES } from "@/constants/notificationTypes";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getPreferences, resolveDelivery, setPreference } from "./preferences";

describe("notification preferences", () => {
  it("defaults to inApp=true, email=false for every NOTIFICATION_TYPES value when user has no rows", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const sig = new AbortController().signal;

      const prefs = await getPreferences(db, alice.id, sig);

      // All types must be present.
      for (const t of NOTIFICATION_TYPES) {
        expect(prefs[t], `missing key: ${t}`).toBeDefined();
      }
      // Spot-check the required types from the brief.
      expect(prefs.mention).toEqual({ inApp: true, email: false });
      expect(prefs.activity_reminder).toEqual({ inApp: true, email: false });

      // Every entry should be the default.
      for (const t of NOTIFICATION_TYPES) {
        expect(prefs[t]).toEqual({ inApp: true, email: false });
      }
    });
  });

  it("setPreference then getPreferences round-trips a changed value", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const sig = new AbortController().signal;

      await setPreference(db, alice.id, "mention", { inApp: false, email: true }, sig);

      const prefs = await getPreferences(db, alice.id, sig);
      expect(prefs.mention).toEqual({ inApp: false, email: true });
      // Other types should still be defaults.
      expect(prefs.activity_reminder).toEqual({ inApp: true, email: false });
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

  it("resolveDelivery returns defaults when no row exists", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const sig = new AbortController().signal;

      const result = await resolveDelivery(db, alice.id, "comment_reply", sig);
      expect(result).toEqual({ inApp: true, email: false });
    });
  });
});
