import { sql } from "drizzle-orm";
import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { DEFAULT_IMPORT_SOURCE, type ImportSource } from "@/constants/importSources";
import { IMPORT_STATUS } from "@/constants/importStatus";
import { users } from "./identity";

export const importStatusEnum = pgEnum("import_status", IMPORT_STATUS);

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetEntity: text("target_entity").notNull(),
  filename: text("filename").notNull(),
  source: text("source").$type<ImportSource>().notNull().default(DEFAULT_IMPORT_SOURCE),
  s3Key: text("s3_key"),
  columnMapping: jsonb("column_mapping")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  status: importStatusEnum("status").notNull().default("pending"),
  totalRows: integer("total_rows").notNull().default(0),
  validRows: integer("valid_rows").notNull().default(0),
  importedRows: integer("imported_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  processedRows: integer("processed_rows").notNull().default(0),
  headers: jsonb("headers").$type<string[]>(),
  previewRows: jsonb("preview_rows").$type<Record<string, string>[]>(),
  undoneAt: timestamp("undone_at", { withTimezone: true }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
