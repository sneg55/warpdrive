import { and, desc, eq } from "drizzle-orm";
import type { FILE_ENTITY_TYPE } from "@/constants/fileEntityTypes";
import type { Db } from "@/db/client";
import { files } from "@/db/schema";

export type FileEntityType = (typeof FILE_ENTITY_TYPE)[number];

export interface FileListItem {
  id: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
  createdAt: Date;
}

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
