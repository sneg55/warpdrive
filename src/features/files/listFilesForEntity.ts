import { and, desc, eq } from "drizzle-orm";
import type { FILE_ENTITY_TYPE } from "@/constants/fileEntityTypes";
import type { Db } from "@/db/client";
import { files } from "@/db/schema";

export type FileEntityType = (typeof FILE_ENTITY_TYPE)[number];

// The client-facing projection: id, display name, size, type, and creation time.
// s3Key / etag / uploadedBy are deliberately never selected so storage internals
// never leave the server boundary.
export interface FileListItem {
  id: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
  createdAt: Date;
}

// Plain read of the CONFIRMED (status='ready') files attached to one entity,
// newest first, on the files_entity_idx (entity_type, entity_id). Excludes
// 'uploading' rows (pending, and the same rows the reaper later deletes). This
// is NOT an authorization boundary: the caller (tRPC router / server action)
// must gate the parent's visibility before exposing the result.
export async function listFilesForEntity(
  db: Db,
  entityType: FileEntityType,
  entityId: string,
  signal: AbortSignal,
): Promise<FileListItem[]> {
  signal.throwIfAborted();
  const rows = await db
    .select({
      id: files.id,
      filename: files.filename,
      sizeBytes: files.sizeBytes,
      contentType: files.contentType,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(
      and(
        eq(files.entityType, entityType),
        eq(files.entityId, entityId),
        eq(files.status, "ready"),
      ),
    )
    .orderBy(desc(files.createdAt));
  signal.throwIfAborted();
  return rows;
}
