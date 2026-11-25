import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type BrevoContactCampaignRow, brevoContactCampaigns } from "@/db/schema";
import type { CampaignStatsRaw } from "./brevoSchemas";

type Executor = Pick<Db, "insert">;

type Timestamped = { campaignId: number; eventTime: string };

const TIME_COLUMNS = [
  ["sentAt", brevoContactCampaigns.sentAt, "sent_at"],
  ["deliveredAt", brevoContactCampaigns.deliveredAt, "delivered_at"],
  ["firstOpenedAt", brevoContactCampaigns.firstOpenedAt, "first_opened_at"],
  ["firstClickedAt", brevoContactCampaigns.firstClickedAt, "first_clicked_at"],
  ["hardBouncedAt", brevoContactCampaigns.hardBouncedAt, "hard_bounced_at"],
  ["softBouncedAt", brevoContactCampaigns.softBouncedAt, "soft_bounced_at"],
  ["complainedAt", brevoContactCampaigns.complainedAt, "complained_at"],
  ["unsubscribedAt", brevoContactCampaigns.unsubscribedAt, "unsubscribed_at"],
] as const;

type TimeKey = (typeof TIME_COLUMNS)[number][0];

function earliest(current: Date | null | undefined, incoming: Date): Date {
  return current === null || current === undefined || incoming < current ? incoming : current;
}

function emptyRow(email: string, campaignId: number): BrevoContactCampaignRow {
  return { email, campaignId, clickedUrls: [] };
}

function rowFor(
  rows: Map<number, BrevoContactCampaignRow>,
  email: string,
  campaignId: number,
): BrevoContactCampaignRow {
  const existing = rows.get(campaignId);
  if (existing !== undefined) return existing;
  const created = emptyRow(email, campaignId);
  rows.set(campaignId, created);
  return created;
}

function foldTimes(
  rows: Map<number, BrevoContactCampaignRow>,
  email: string,
  events: Timestamped[],
  key: TimeKey,
): void {
  for (const e of events) {
    const row = rowFor(rows, email, e.campaignId);
    row[key] = earliest(row[key], new Date(e.eventTime));
  }
}

function foldClicks(
  rows: Map<number, BrevoContactCampaignRow>,
  email: string,
  clicked: CampaignStatsRaw["clicked"],
): void {
  for (const c of clicked) {
    if (c.links.length === 0) continue;
    const row = rowFor(rows, email, c.campaignId);
    const urls = new Set(row.clickedUrls ?? []);
    for (const link of c.links) {
      row.firstClickedAt = earliest(row.firstClickedAt, new Date(link.eventTime));
      urls.add(link.url);
    }
    row.clickedUrls = [...urls].sort();
  }
}

export function foldStats(email: string, stats: CampaignStatsRaw): BrevoContactCampaignRow[] {
  const rows = new Map<number, BrevoContactCampaignRow>();
  foldTimes(rows, email, stats.messagesSent, "sentAt");
  foldTimes(rows, email, stats.delivered, "deliveredAt");
  foldTimes(rows, email, stats.opened, "firstOpenedAt");
  foldClicks(rows, email, stats.clicked);
  foldTimes(rows, email, stats.hardBounces, "hardBouncedAt");
  foldTimes(rows, email, stats.softBounces, "softBouncedAt");
  foldTimes(rows, email, stats.complaints, "complainedAt");
  const attributed = stats.unsubscriptions.userUnsubscription.flatMap((u) =>
    u.campaignId === null ? [] : [{ campaignId: u.campaignId, eventTime: u.eventTime }],
  );
  foldTimes(rows, email, attributed, "unsubscribedAt");
  return [...rows.values()];
}

const TABLE = sql.raw("brevo_contact_campaigns");

function mergedTime(column: string): SQL {
  return sql`LEAST(${TABLE}.${sql.raw(column)}, excluded.${sql.raw(column)})`;
}

const MERGED_URLS = sql`ARRAY(
  SELECT DISTINCT u FROM unnest(${TABLE}.clicked_urls || excluded.clicked_urls) AS u ORDER BY u
)`;

function mergeAssignments(): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [key, , column] of TIME_COLUMNS) set[key] = mergedTime(column);
  set.clickedUrls = MERGED_URLS;
  return set;
}

function changedWhere(): SQL {
  const parts = TIME_COLUMNS.map(
    ([, , column]) => sql`${TABLE}.${sql.raw(column)} IS DISTINCT FROM ${mergedTime(column)}`,
  );
  parts.push(sql`${TABLE}.clicked_urls IS DISTINCT FROM ${MERGED_URLS}`);
  return sql.join(parts, sql` OR `);
}

export async function upsertCampaignRows(
  db: Executor,
  rows: BrevoContactCampaignRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(brevoContactCampaigns)
    .values(rows)
    .onConflictDoUpdate({
      target: [brevoContactCampaigns.email, brevoContactCampaigns.campaignId],
      set: { ...mergeAssignments(), updatedAt: sql`now()` },
      setWhere: changedWhere(),
    });
}
