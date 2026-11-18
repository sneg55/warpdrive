import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { DEFAULT_IMPORT_SOURCE, IMPORT_SOURCES } from "@/constants/importSources";
import { PGBOSS_QUEUE_IMPORT_PREPARE } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { importBatches } from "@/db/schema";
import { buildObjectKey, confirmedObjectKey } from "@/features/files/keys";
import type { PresignedPost, StorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import { IMPORT_TARGETS, targetsFor } from "./importFields";
import { enqueueBatchJob } from "./jobRunner";

const requestImportUploadInput = z
  .object({
    targetEntity: z.enum(IMPORT_TARGETS),
    source: z.enum(IMPORT_SOURCES).default(DEFAULT_IMPORT_SOURCE),
    filename: z.string().min(1).max(255),
    contentType: z.literal("text/csv"),
    size: z.number().int().positive().max(env.MAX_FILE_BYTES),
  })
  .refine((input) => targetsFor(input.source).includes(input.targetEntity), {
    path: ["targetEntity"],
    message: "this import source cannot target that entity",
  });
export type RequestImportUploadInput = z.input<typeof requestImportUploadInput>;

function buildImportObjectKey(batchId: string, fileId: string, filename: string): string {
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
      source: input.source,
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

async function enqueuePrepareJob(batchId: string, signal: AbortSignal): Promise<void> {
  await enqueueBatchJob(PGBOSS_QUEUE_IMPORT_PREPARE, batchId, signal);
}
