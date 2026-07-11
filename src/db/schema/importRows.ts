import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { IMPORT_ROW_STATUS } from "@/constants/importStatus";
import type { MappedRow } from "@/types/import";
import { importBatches } from "./importBatches";

export const importRowStatusEnum = pgEnum("import_row_status", IMPORT_ROW_STATUS);

// One parsed CSV row. UNIQUE(batch_id, row_number) is the idempotency guard so a
// retried batch cannot double-insert the same source row (data-model section 17).
export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").$type<Record<string, string>>().notNull(),
    mapped: jsonb("mapped").$type<MappedRow | null>(),
    status: importRowStatusEnum("status").notNull().default("pending"),
    errors: jsonb("errors")
      .$type<{ field: string; message: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdEntityId: uuid("created_entity_id"),
    // Records a row created as a SIDE EFFECT of its primary entity. Each is null when the row
    // linked to a pre-existing record instead of creating one. Undo removes them too, or an
    // undone import leaves orphan organizations, people, and notes behind. A record the row
    // merely LINKED to carries null here and is never touched.
    createdOrgId: uuid("created_org_id"),
    createdPersonId: uuid("created_person_id"),
    createdNoteId: uuid("created_note_id"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("import_row_unique").on(t.batchId, t.rowNumber),
    index("import_rows_batch_status_idx").on(t.batchId, t.status),
  ],
);

export type ImportRow = typeof importRows.$inferSelect;
export type NewImportRow = typeof importRows.$inferInsert;
