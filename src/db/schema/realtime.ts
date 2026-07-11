import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

// Single-use WS upgrade tickets. INSERT-ON-CONSUME design: there is NO row at mint
// time; the WS server consumes a ticket by INSERTing its jti (ON CONFLICT (jti) DO
// NOTHING), and the PK conflict enforces single-use across replicas (ops spec A1). A
// row existing means the ticket was consumed, so consumed_at defaults to now() at that
// insert. A reaper deletes expired rows. The 60s exp bounds table growth.
export const wsTickets = pgTable("ws_tickets", {
  jti: uuid("jti").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Monotonic per-channel version, bumped in the SAME tx as a mutation so a rolled-back
// write publishes nothing and the WS server can order/de-dup the global LISTEN stream
// and detect its own LISTEN-loss gap (ops spec A4). Internal; never sent to clients.
// The documented bump SQL sets updated_at = now() explicitly on the ON CONFLICT update.
export const channelVersions = pgTable("channel_versions", {
  channel: text("channel").primaryKey(),
  version: bigint("version", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WsTicket = typeof wsTickets.$inferSelect;
