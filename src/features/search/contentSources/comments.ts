import { sql } from "drizzle-orm";
import { SEARCH_SOURCE_LABELS } from "@/constants/search";
import { matchesEveryTerm } from "../pattern";
import type { ContentSource } from "./types";

export const commentsSource: ContentSource = ({ section, pattern }) =>
  section === "lead"
    ? null
    : sql`
  SELECT n.entity_id AS record_id, 'comment' AS source, ${SEARCH_SOURCE_LABELS.comment}::text AS label,
         c.body AS matched_text, c.created_at AS matched_at
  FROM comments c
  JOIN notes n ON n.id = c.note_id AND n.deleted_at IS NULL
  WHERE n.entity_type = ${section} AND ${matchesEveryTerm(sql`c.body`, pattern)}`;
