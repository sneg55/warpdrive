import { sql } from "drizzle-orm";
import { BREVO_TIMELINE_LIMIT } from "@/constants/brevo";
import type { Db } from "@/db/client";
import { visiblePersonsForScope } from "@/features/contacts/scopePersons";
import { personEmailPairsSql } from "@/features/intercom/personMatch";
import type { SupportScope } from "@/features/intercom/supportTypes";
import type { PermSetUser } from "@/features/permissions/effective";
import type { MarketingCampaignItem, MarketingCampaignList } from "./types";

type Timestamp = Date | string | null;

interface CampaignRow {
  campaign_id: string | number;
  campaign_name: string | null;
  subject: string | null;
  recipient_email: string;
  recipient_person_id: string;
  at: Timestamp;
  sent_at: Timestamp;
  delivered_at: Timestamp;
  first_opened_at: Timestamp;
  first_clicked_at: Timestamp;
  clicked_urls: string[];
  hard_bounced_at: Timestamp;
  soft_bounced_at: Timestamp;
  complained_at: Timestamp;
  unsubscribed_at: Timestamp;
}

function iso(value: Timestamp): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function toItem(r: CampaignRow): MarketingCampaignItem {
  const campaignId = Number(r.campaign_id);
  return {
    campaignId,
    campaignName: r.campaign_name ?? `Campaign #${campaignId}`,
    subject: r.subject,
    recipientEmail: r.recipient_email,
    recipientPersonId: r.recipient_person_id,
    at: new Date(r.at ?? 0).toISOString(),
    sentAt: iso(r.sent_at),
    deliveredAt: iso(r.delivered_at),
    firstOpenedAt: iso(r.first_opened_at),
    firstClickedAt: iso(r.first_clicked_at),
    clickedUrls: r.clicked_urls,
    hardBouncedAt: iso(r.hard_bounced_at),
    softBouncedAt: iso(r.soft_bounced_at),
    complainedAt: iso(r.complained_at),
    unsubscribedAt: iso(r.unsubscribed_at),
  };
}

const EMPTY: MarketingCampaignList = { items: [], truncated: false };

export async function listMarketingCampaigns(
  db: Db,
  actor: PermSetUser,
  scope: SupportScope,
  signal: AbortSignal,
): Promise<MarketingCampaignList> {
  const personIds = await visiblePersonsForScope(db, actor, scope, signal);
  if (personIds.length === 0) return EMPTY;
  const idList = sql.join(
    personIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = (
    await db.execute(sql`
      WITH pairs AS (${personEmailPairsSql(idList)}),
      timeline AS (
        SELECT r.campaign_id, c.name AS campaign_name, c.subject, r.email AS recipient_email,
          pairs.person_id AS recipient_person_id,
          COALESCE(r.sent_at, r.delivered_at, c.sent_at,
            LEAST(r.first_opened_at, r.first_clicked_at, r.soft_bounced_at, r.hard_bounced_at,
              r.complained_at, r.unsubscribed_at)) AS at,
          r.sent_at, r.delivered_at, r.first_opened_at, r.first_clicked_at, r.clicked_urls,
          r.hard_bounced_at, r.soft_bounced_at, r.complained_at, r.unsubscribed_at
        FROM brevo_contact_campaigns r
        JOIN pairs ON pairs.email = r.email
        LEFT JOIN brevo_campaigns c ON c.id = r.campaign_id
      )
      SELECT * FROM timeline
      WHERE at IS NOT NULL
      ORDER BY at DESC, campaign_id DESC, recipient_email ASC
      LIMIT ${BREVO_TIMELINE_LIMIT + 1}`)
  ).rows as unknown as CampaignRow[];
  signal.throwIfAborted();
  return {
    items: rows.slice(0, BREVO_TIMELINE_LIMIT).map(toItem),
    truncated: rows.length > BREVO_TIMELINE_LIMIT,
  };
}
