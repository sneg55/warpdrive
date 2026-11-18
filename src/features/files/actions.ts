import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { files } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { canActorAccessParent } from "./fileAuthz";
import { canActorModifyParent } from "./fileWriteAuthz";
import { buildObjectKey, confirmedObjectKey, validateDisplayFilename } from "./keys";
import {
  confirmUploadInput,
  type RequestUploadInput,
  requestDownloadInput,
  requestUploadInput,
} from "./schemas";
import type { PresignedPost, StorageClient } from "./storage";

interface RequestUploadArgs {
  actor: PermSetUser;
  storage: StorageClient;
  input: RequestUploadInput;
}

export async function requestUpload(
  db: Db,
  args: RequestUploadArgs,
  signal: AbortSignal,
): Promise<Result<{ fileId: string; post: PresignedPost }, AppError>> {
  signal.throwIfAborted();

  const parsed = requestUploadInput.safeParse(args.input);
  if (!parsed.success) {
    return err(new AppError(ERROR_IDS.FILE_PRESIGN_INVALID, "invalid upload input", {}));
  }
  const input = parsed.data;

  const allowed = await canActorModifyParent(
    db,
    args.actor,
    input.entityType,
    input.entityId,
    signal,
  );
  signal.throwIfAborted();
  if (!allowed) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "not permitted to attach to parent", {}));
  }

  const display = validateDisplayFilename(input.filename);
  if (!display.ok) return display;

  const fileId = randomUUID();
  const s3Key = buildObjectKey({
    entityType: input.entityType,
    entityId: input.entityId,
    fileId,
    filename: display.value,
  });

  await db.insert(files).values({
    id: fileId,
    entityType: input.entityType,
    entityId: input.entityId,
    filename: display.value,
    s3Key,
    sizeBytes: input.size,
    contentType: input.contentType,
    status: "uploading",
    uploadedBy: args.actor.id,
  });
  signal.throwIfAborted();

  const post = await args.storage.presignPost(s3Key, input.contentType, signal);
  if (!post.ok) return post;
  return ok({ fileId, post: post.value });
}

interface ConfirmUploadArgs {
  actor: PermSetUser;
  storage: StorageClient;
  fileId: string;
}

export async function confirmUpload(
  db: Db,
  args: ConfirmUploadArgs,
  signal: AbortSignal,
): Promise<Result<{ status: "ready" }, AppError>> {
  signal.throwIfAborted();

  const parsed = confirmUploadInput.safeParse({ fileId: args.fileId });
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.FILE_PRESIGN_INVALID, "invalid file id", {
        issues: parsed.error.issues,
      }),
    );
  }

  const [row] = await db.select().from(files).where(eq(files.id, args.fileId));
  signal.throwIfAborted();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.FILE_PRESIGN_INVALID, "file not found", {}));
  }
  if (row.uploadedBy !== args.actor.id) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "not the uploader", {}));
  }
  if (row.status !== "uploading") {
    return err(new AppError(ERROR_IDS.FILE_METADATA_MISMATCH, "not in uploading state", {}));
  }

  const allowed = await canActorModifyParent(db, args.actor, row.entityType, row.entityId, signal);
  signal.throwIfAborted();
  if (!allowed) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "not permitted to confirm", {}));
  }

  const head = await args.storage.headObject(row.s3Key, signal);
  if (!head.ok) return head;
  signal.throwIfAborted();

  if (head.value.size !== row.sizeBytes || head.value.contentType !== row.contentType) {
    await args.storage.deleteObject(row.s3Key, signal);
    return err(new AppError(ERROR_IDS.FILE_METADATA_MISMATCH, "metadata mismatch", {}));
  }

  const immutableKey = confirmedObjectKey(row.s3Key);
  const copied = await args.storage.copyObject(row.s3Key, immutableKey, signal);
  if (!copied.ok) return copied;
  signal.throwIfAborted();

  const confirmedHead = await args.storage.headObject(immutableKey, signal);
  if (!confirmedHead.ok) return confirmedHead;
  signal.throwIfAborted();

  await db
    .update(files)
    .set({ status: "ready", s3Key: immutableKey, etag: confirmedHead.value.etag })
    .where(eq(files.id, args.fileId));
  signal.throwIfAborted();

  await args.storage.deleteObject(row.s3Key, signal);
  signal.throwIfAborted();
  return ok({ status: "ready" });
}

interface RequestDownloadArgs {
  actor: AuthUser;
  storage: StorageClient;
  fileId: string;
}

export async function requestDownload(
  db: Db,
  args: RequestDownloadArgs,
  signal: AbortSignal,
): Promise<Result<{ url: string }, AppError>> {
  signal.throwIfAborted();

  const parsed = requestDownloadInput.safeParse({ fileId: args.fileId });
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.FILE_PRESIGN_INVALID, "invalid file id", {
        issues: parsed.error.issues,
      }),
    );
  }

  const [row] = await db.select().from(files).where(eq(files.id, args.fileId));
  signal.throwIfAborted();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.FILE_PRESIGN_INVALID, "file not found", {}));
  }

  const allowed = await canActorAccessParent(db, args.actor, row.entityType, row.entityId, signal);
  signal.throwIfAborted();
  if (!allowed) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "not permitted to download", {}));
  }

  if (row.status !== "ready") {
    return err(new AppError(ERROR_IDS.FILE_PRESIGN_INVALID, "file not ready for download", {}));
  }

  if (row.etag !== null) {
    const head = await args.storage.headObject(row.s3Key, signal);
    signal.throwIfAborted();
    if (!head.ok) return head;
    if (head.value.etag !== row.etag) {
      return err(
        new AppError(ERROR_IDS.FILE_METADATA_MISMATCH, "object changed since confirmation", {}),
      );
    }
  }

  const url = await args.storage.presignGet(row.s3Key, row.filename, signal);
  if (!url.ok) return url;
  return ok({ url: url.value });
}
