import { env } from "@/config/env";
import { entityHref } from "@/features/notifications/entityHref";
import type { NotificationRow } from "@/types/notification";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] ?? c;
  });
}

function wrap(line: string, link: string): { text: string; html: string } {
  const text = `${line}\n\nOpen: ${link}`;
  const html = `<p>${escapeHtml(line)}</p><p><a href="${escapeHtml(link)}">Open in Warpdrive</a></p>`;
  return { text, html };
}

// Per-type copy strings. No em dashes; no magic strings duplicated.
export function renderNotificationEmail(
  row: NotificationRow,
  recipientName: string,
): { subject: string; text: string; html: string } {
  const base = env.BASE_URL;
  // Never derive the path from the entity type: pluralizing it produced /activitys/<id>,
  // /persons/<id> and /organizations/<id>, none of which are routes in this app.
  const path = entityHref(row.entityType, row.entityId);
  const link = path !== null ? `${base}${path}` : base;

  let subject: string;
  let line: string;

  switch (row.type) {
    case "mention":
      subject = "Somebody mentioned you in Warpdrive";
      line = `${recipientName}, somebody mentioned you.`;
      break;
    case "activity_assigned":
      subject = "An activity was assigned to you in Warpdrive";
      line = `${recipientName}, an activity was assigned to you.`;
      break;
    case "activity_reminder": {
      const activitySubject =
        typeof row.payload.subject === "string" ? row.payload.subject : "activity";
      subject = `Reminder: ${activitySubject} is due soon`;
      line = `${recipientName}, your activity "${activitySubject}" is due soon.`;
      break;
    }
    case "deal_followed_update":
      subject = "A deal you follow has an update";
      line = `${recipientName}, a deal you are following has been updated.`;
      break;
    case "email_open":
      subject = "Your email was opened";
      line = `${recipientName}, someone opened your email.`;
      break;
    case "email_click":
      subject = "A link in your email was clicked";
      line = `${recipientName}, someone clicked a link in your email.`;
      break;
    case "deal_won":
      subject = "Deal won!";
      line = `${recipientName}, a deal was marked as won.`;
      break;
    case "deal_lost":
      subject = "Deal lost";
      line = `${recipientName}, a deal was marked as lost.`;
      break;
    case "comment_reply":
      subject = "Someone replied to your comment in Warpdrive";
      line = `${recipientName}, somebody replied to your comment.`;
      break;
    case "deal_email_received": {
      const emailSubject = typeof row.payload.subject === "string" ? row.payload.subject : null;
      subject =
        emailSubject !== null ? `New email on a deal: ${emailSubject}` : "New email on a deal";
      line = `${recipientName}, a new email arrived on a deal you follow.`;
      break;
    }
    default: {
      // Unknown future type: render a generic fallback. Never throw (pg-boss resilience).
      subject = "Warpdrive notification";
      line = `${recipientName}, you have a new notification.`;
    }
  }

  const { text, html } = wrap(line, link);
  return { subject, text, html };
}
