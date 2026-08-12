import { describe, expect, it } from "vitest";
import type { NotificationType } from "@/constants/notificationTypes";
import type { NotificationFeedItem } from "@/types/notification";
import { notificationHref } from "./deepLink";

function item(over: {
  type: NotificationType;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}): NotificationFeedItem {
  return {
    id: "n1",
    userId: "u1",
    actorId: null,
    readAt: null,
    createdAt: "2026-08-12T16:20:00.000Z",
    band: "earlier",
    entityType: null,
    entityId: null,
    payload: {},
    ...over,
  };
}

describe("notificationHref", () => {
  it("never routes an activity-scoped reminder to a deal URL", () => {
    // Regression: reminder rows carry entityType "activity" and the ACTIVITY id, and the map
    // built /deals/<activityId> unconditionally, which always rendered Not found.
    const href = notificationHref(
      item({ type: "activity_reminder", entityType: "activity", entityId: "a1" }),
    );
    expect(href).not.toContain("/deals/");
    expect(href).toBe("/activities/calendar");
  });

  it("opens the parent record of a reminder when the row carries one", () => {
    expect(
      notificationHref(item({ type: "activity_reminder", entityType: "deal", entityId: "d1" })),
    ).toBe("/deals/d1");
    expect(
      notificationHref(item({ type: "activity_reminder", entityType: "person", entityId: "p1" })),
    ).toBe("/contacts/people/p1");
  });

  it("routes an org-parented activity assignment to the org, not to /deals/<orgId>", () => {
    expect(
      notificationHref(
        item({ type: "activity_assigned", entityType: "organization", entityId: "o1" }),
      ),
    ).toBe("/contacts/orgs/o1");
  });

  it("falls back to the calendar for an activity notification with no parent", () => {
    expect(notificationHref(item({ type: "activity_assigned" }))).toBe("/activities/calendar");
  });

  it("routes an organization mention to the org page instead of the dashboard", () => {
    // Producers store "organization" (ENTITY_TYPES); the old map compared against "org", so an
    // org mention silently landed on "/".
    expect(
      notificationHref(item({ type: "mention", entityType: "organization", entityId: "o1" })),
    ).toBe("/contacts/orgs/o1");
  });

  it("keeps deal-scoped types on the deal page", () => {
    expect(notificationHref(item({ type: "deal_won", entityType: "deal", entityId: "d1" }))).toBe(
      "/deals/d1",
    );
    expect(
      notificationHref(item({ type: "deal_followed_update", entityType: "deal", entityId: "d1" })),
    ).toBe("/deals/d1");
  });

  it("routes email notifications to their thread", () => {
    expect(
      notificationHref(
        item({
          type: "email_open",
          entityType: "email_message",
          entityId: "m1",
          payload: { threadId: "t1" },
        }),
      ),
    ).toBe("/inbox/t1");
    expect(notificationHref(item({ type: "email_click" }))).toBe("/inbox");
  });
});
