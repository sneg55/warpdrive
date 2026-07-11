import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES } from "@/constants/notificationTypes";
import { renderNotificationEmail } from "./render";

describe("renderNotificationEmail", () => {
  it("renders a mention email with subject and bodies", () => {
    const out = renderNotificationEmail(
      {
        id: "n1",
        userId: "u1",
        type: "mention",
        entityType: "deal",
        entityId: "d1",
        actorId: "u2",
        payload: { source: "note", sourceId: "s1" },
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      "Jane",
    );
    expect(out.subject).toContain("mentioned you");
    expect(out.text).toContain("Jane");
    expect(out.html).toContain("<");
  });

  it("renders an activity reminder email", () => {
    const out = renderNotificationEmail(
      {
        id: "n2",
        userId: "u1",
        type: "activity_reminder",
        entityType: "deal",
        entityId: "d1",
        actorId: null,
        payload: { subject: "Call Acme" },
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      "Jane",
    );
    expect(out.subject).toContain("Reminder");
    expect(out.text).toContain("Call Acme");
  });

  it("renders a non-empty subject, text, and html for every notification type", () => {
    for (const type of NOTIFICATION_TYPES) {
      const out = renderNotificationEmail(
        {
          id: "n3",
          userId: "u1",
          type,
          entityType: null,
          entityId: null,
          actorId: null,
          payload: { subject: "Task" },
          readAt: null,
          createdAt: new Date().toISOString(),
        },
        "Bob",
      );
      expect(out.subject.length, `subject empty for type ${type}`).toBeGreaterThan(0);
      expect(out.text.length, `text empty for type ${type}`).toBeGreaterThan(0);
      expect(out.html, `html missing < for type ${type}`).toContain("<");
    }
  });
});
