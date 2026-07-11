import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { PGBOSS_QUEUE_IMPORT_PREPARE } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { importBatches } from "@/db/schema";
import { buildObjectKey, confirmedObjectKey } from "@/features/files/keys";
import type { PresignedPost, StorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import { enqueueBatchJob } from "./jobRunner";

const IMPORT_TARGETS = ["person", "organization", "deal", "lead", "activity"] as const;

export const requestImportUploadInput = z.object({
  targetEntity: z.enum(IMPORT_TARGETS),
  filename: z.string().min(1).max(255),
  contentType: z.literal("text/csv"),
  size: z.number().int().positive().max(env.MAX_FILE_BYTES),
});
export type RequestImportUploadInput = z.infer<typeof requestImportUploadInput>;

// Import CSVs get their own object namespace (not an entity attachment). buildObjectKey
// accepts a free-form entityType string, so no coupling to the files FileEntityType enum.
export function buildImportObjectKey(batchId: string, fileId: string, filename: string): string {
  return buildObjectKey({ entityType: "import", entityId: batchId, fileId, filename });
}

export async function requestImportUpload(
  db: Db,
  args: { actorId: string; storage: StorageClient; input: RequestImportUploadInput },
  signal: AbortSignal,
): Promise<Result<{ batchId: string; post: PresignedPost }, AppError>> {
  signal.throwIfAborted();
  const input = requestImportUploadInput.parse(args.input);
  const [batch] = await db
    .insert(importBatches)
    .values({
      targetEntity: input.targetEntity,
      filename: input.filename,
      status: "uploaded",
      createdBy: args.actorId,
    })
    .returning({ id: importBatches.id });
  if (batch === undefined) {
    return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "no batch row", {}));
  }
  const fileId = randomUUID();
  const s3Key = buildImportObjectKey(batch.id, fileId, input.filename);
  await db.update(importBatches).set({ s3Key }).where(eq(importBatches.id, batch.id));
  signal.throwIfAborted();
  const post = await args.storage.presignPost(s3Key, "text/csv", signal);
  if (!post.ok) return post;
  return ok({ batchId: batch.id, post: post.value });
}

export async function confirmImportUpload(
  db: Db,
  args: { actorId: string; storage: StorageClient; batchId: string },
  signal: AbortSignal,
): Promise<Result<{ batchId: string }, AppError>> {
  signal.throwIfAborted();
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, args.batchId));
  if (batch === undefined || batch.createdBy !== args.actorId) {
    return err(
      new AppError(ERROR_IDS.IMPORT_BATCH_NOT_FOUND, "not found", { batchId: args.batchId }),
    );
  }
  if (batch.s3Key === null) {
    return err(
      new AppError(ERROR_IDS.IMPORT_UPLOAD_INCOMPLETE, "no object key", { batchId: args.batchId }),
    );
  }
  const head = await args.storage.headObject(batch.s3Key, signal);
  if (!head.ok) return head;
  if (head.value.size > env.MAX_FILE_BYTES) {
    await args.storage.deleteObject(batch.s3Key, signal);
    return err(
      new AppError(ERROR_IDS.IMPORT_UPLOAD_INCOMPLETE, "object too large", {
        batchId: args.batchId,
      }),
    );
  }
  // Copy the validated object to an immutable "confirmed/" key the uploader's still-valid
  // presigned POST can never target, and point the batch at it. The prepare job reads only
  // this key, so an overwrite of the original upload key after confirm (or between a parse
  // retry's reads) cannot change or split what gets parsed (F33 TOCTOU, mirrors files).
  const confirmedKey = confirmedObjectKey(batch.s3Key);
  const copied = await args.storage.copyObject(batch.s3Key, confirmedKey, signal);
  if (!copied.ok) return copied;
  await db
    .update(importBatches)
    .set({ s3Key: confirmedKey })
    .where(eq(importBatches.id, args.batchId));
  await enqueuePrepareJob(args.batchId, signal);
  return ok({ batchId: args.batchId });
}

export async function enqueuePrepareJob(batchId: string, signal: AbortSignal): Promise<void> {
  await enqueueBatchJob(PGBOSS_QUEUE_IMPORT_PREPARE, batchId, signal);
}
