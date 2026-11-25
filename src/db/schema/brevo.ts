import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const brevoCampaigns = pgTable("brevo_campaigns", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  subject: text("subject"),
  status: text("status").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brevoContactCampaigns = pgTable(
  "brevo_contact_campaigns",
  {
    email: text("email").notNull(),
    campaignId: bigint("campaign_id", { mode: "number" }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    firstClickedAt: timestamp("first_clicked_at", { withTimezone: true }),
    clickedUrls: text("clicked_urls").array().notNull().default(sql`'{}'::text[]`),
    hardBouncedAt: timestamp("hard_bounced_at", { withTimezone: true }),
    softBouncedAt: timestamp("soft_bounced_at", { withTimezone: true }),
    complainedAt: timestamp("complained_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.email, t.campaignId] }),
    check("brevo_contact_campaigns_email_lowercase", sql`${t.email} = lower(btrim(${t.email}))`),
  ],
);

export const brevoTrackedEmails = pgTable(
  "brevo_tracked_emails",
  {
    email: text("email").primaryKey(),
    active: boolean("active").notNull().default(true),
    coveredThrough: date("covered_through", { mode: "string" }),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    notFoundAt: timestamp("not_found_at", { withTimezone: true }),
  },
  (t) => [
    check("brevo_tracked_emails_email_lowercase", sql`${t.email} = lower(btrim(${t.email}))`),
  ],
);

export type BrevoContactCampaignRow = typeof brevoContactCampaigns.$inferInsert;
