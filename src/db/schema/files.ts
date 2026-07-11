import { bigint, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { FILE_STATUS } from "@/constants/fileEntityTypes";
import { users } from "./identity";

export const fileEntityType = pgEnum("file_entity_type", [
  "deal",
  "person",
  "organization",
  "activity",
  "email_message",
]);

export const fileStatus = pgEnum("file_status", FILE_STATUS);

// File metadata (objects live in MinIO/S3; s3_key locates them). data-model section 8.
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: fileEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    filename: text("filename").notNull(),
    s3Key: text("s3_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    contentType: text("content_type").notNull(),
    // Object ETag captured at confirm time. Downloads revalidate the live object against
    // this so a still-valid presigned POST cannot silently overwrite a confirmed file (F31).
    // Nullable: pre-existing rows predate the binding and skip the check.
    etag: text("etag"),
    // uploading on row create; flips to ready after client confirms presigned upload.
    status: fileStatus("status").notNull().default("uploading"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_entity_idx").on(t.entityType, t.entityId)],
);

export type FileRow = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
