import { sql } from "drizzle-orm";
import { SEARCH_SOURCE_LABELS } from "@/constants/search";
import { matchesEveryTerm } from "../pattern";
import type { ContentSource } from "./types";

export const notesSource: ContentSource = ({ section, pattern }) => sql`
  SELECT n.entity_id AS record_id, 'note' AS source, ${SEARCH_SOURCE_LABELS.note}::text AS label,
         search_plain_text(n.body) AS matched_text, n.created_at AS matched_at
  FROM notes n
  WHERE n.entity_type = ${section} AND n.deleted_at IS NULL
    AND ${matchesEveryTerm(sql`search_plain_text(n.body)`, pattern)}`;
