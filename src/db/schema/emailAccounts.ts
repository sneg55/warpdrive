import { sql } from "drizzle-orm";
import {
  check,
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { EMAIL_ACCOUNT_STATUS } from "@/constants/email";
import {
  EMAIL_ACCOUNT_KIND,
  EMAIL_BACKFILL_STATUS,
  TEAM_MAILBOX_OVERDUE_HOURS,
} from "@/constants/teamMailbox";
import { citext, users } from "./identity";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const emailAccountKind = pgEnum("email_account_kind", EMAIL_ACCOUNT_KIND);
export const emailBackfillStatus = pgEnum("email_backfill_status", EMAIL_BACKFILL_STATUS);
export const emailAccountStatus = pgEnum("email_account_status", EMAIL_ACCOUNT_STATUS);

export const emailAccounts = pgTable(
  "email_accounts",
  {
    kind: emailAccountKind("kind").notNull().default("personal"),
    displayName: text("display_name"),
    overdueAfterHours: integer("overdue_after_hours").notNull().default(TEAM_MAILBOX_OVERDUE_HOURS),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id),
    backfillDays: integer("backfill_days"),
    backfillStatus: emailBackfillStatus("backfill_status"),
    backfillPageToken: text("backfill_page_token"),
    backfillErrorId: text("backfill_error_id"),
    backfillStartedAt: timestamp("backfill_started_at", { withTimezone: true }),
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .unique(),
    emailAddress: citext("email_address").notNull().unique(),
    refreshTokenEnc: bytea("refresh_token_enc"),
    scopes: jsonb("scopes").notNull().default("[]"),
    lastHistoryId: text("last_history_id"),
    watchExpiresAt: timestamp("watch_expires_at", { withTimezone: true }),
    status: emailAccountStatus("status").notNull().default("connected"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastErrorId: text("last_error_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("email_account_owner_kind", sql`(${t.kind} = 'personal') = (${t.userId} IS NOT NULL)`),
  ],
);

export const emailAccountMembers = pgTable(
  "email_account_members",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => emailAccounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.userId] })],
);

export type EmailAccount = typeof emailAccounts.$inferSelect;
export type NewEmailAccount = typeof emailAccounts.$inferInsert;
