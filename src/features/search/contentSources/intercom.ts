import { sql } from "drizzle-orm";
import { SEARCH_SOURCE_LABELS } from "@/constants/search";
import { contactEmailBelongsToPersonSql, matchableEmailSql } from "@/features/intercom/personMatch";
import { matchesEveryTerm } from "../pattern";
import { visiblePersonExists } from "../visibilitySql";
import type { ContentSource } from "./types";

export const intercomSource: ContentSource = ({ section, pattern, ctx }) =>
  section === "deal"
    ? sql`
  SELECT s.deal_id AS record_id, 'intercom' AS source, ${SEARCH_SOURCE_LABELS.intercom}::text AS label,
         s.plain_text AS matched_text, s.matched_at AS matched_at
  FROM deal_intercom_search s
  JOIN deals d ON d.id = s.deal_id AND d.deleted_at IS NULL
  JOIN intercom_conversations c ON c.id = s.conversation_id AND c.message_count > 0
  JOIN intercom_contacts ic ON ic.id = s.contact_id
  WHERE ${matchesEveryTerm(sql`s.plain_text`, pattern)}
    AND (
      d.person_id = s.person_id
      OR EXISTS (
        SELECT 1 FROM deal_participants dp WHERE dp.deal_id = s.deal_id AND dp.person_id = s.person_id
      )
    )
    AND ${matchableEmailSql(sql`ic.email`)}
    AND ${contactEmailBelongsToPersonSql(sql`s.person_id`, sql`ic.email`)}
    AND ${visiblePersonExists(ctx, sql`s.person_id`)}`
    : null;
