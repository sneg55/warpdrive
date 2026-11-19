import { sql } from "drizzle-orm";
import { SEARCH_SOURCE_LABELS } from "@/constants/search";
import { matchesEveryTerm } from "../pattern";
import type { ContentSource } from "./types";

export const filesSource: ContentSource = ({ section, pattern }) =>
  section === "lead"
    ? null
    : sql`
  SELECT f.entity_id AS record_id, 'file' AS source, ${SEARCH_SOURCE_LABELS.file}::text AS label,
         f.filename AS matched_text, f.created_at AS matched_at
  FROM files f
  WHERE f.entity_type = ${section} AND f.status = 'ready' AND ${matchesEveryTerm(sql`f.filename`, pattern)}`;
