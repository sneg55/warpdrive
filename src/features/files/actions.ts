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

// Authorize the parent, then validate the display filename, then mint an
// uploading row + presigned POST. No row is written on an authz or validation
// failure, so a denied actor never observes a URL or a side effect.
export async function requestUpload(
  db: Db,
  args: RequestUploadArgs,
  signal: AbortSignal,
): Promise<Result<{ fileId: string; post: PresignedPost }, AppError>> {
  signal.throwIfAborted();

  // a. Boundary validation: content-type allowlist + size <= MAX_FILE_BYTES.
  const parsed = requestUploadInput.safeParse(args.input);
  if (!parsed.success) {
    return err(new AppError(ERROR_IDS.FILE_PRESIGN_INVALID, "invalid upload input", {}));
  }
  const input = parsed.data;

  // b. Parent authorization. Uploads require the entity's WRITE capability (canSee alone is
  // insufficient: a read-only viewer must not attach files, F18). Deny writes no row.
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

  // c. Validate the display filename (CRLF / traversal / over-length).
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

// Reload the row, enforce ownership + uploading status, re-check parent authz
// (defense in depth), then HEAD the object and require size + content-type to
// match. A mismatch deletes the object and fails with E_FILE_002.
export async function confirmUpload(
  db: Db,
  args: ConfirmUploadArgs,
  signal: AbortSignal,
): Promise<Result<{ status: "ready" }, AppError>> {
  signal.throwIfAborted();

  // Boundary: validate fileId is a uuid before hitting the DB (a non-uuid causes
  // Postgres to throw a cast error that escapes the Result envelope).
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

  // Defense in depth: re-check the WRITE capability (not just canSee) on confirm too (F18).
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

  // Copy the validated object to an immutable key the uploader's still-valid presigned POST
  // can never target (its policy pins the upload key). Downloads serve ONLY this key, so an
  // overwrite of the upload key after confirm cannot change what a recipient receives (F33).
  const immutableKey = confirmedObjectKey(row.s3Key);
  const copied = await args.storage.copyObject(row.s3Key, immutableKey, signal);
  if (!copied.ok) return copied;
  signal.throwIfAborted();

  // Capture the confirmed copy's own ETag (a server-side copy gets a fresh ETag) so a
  // download can still detect corruption or an out-of-band change as defense in depth.
  const confirmedHead = await args.storage.headObject(immutableKey, signal);
  if (!confirmedHead.ok) return confirmedHead;
  signal.throwIfAborted();

  await db
    .update(files)
    .set({ status: "ready", s3Key: immutableKey, etag: confirmedHead.value.etag })
    .where(eq(files.id, args.fileId));
  signal.throwIfAborted();

  // Best-effort: drop the mutable upload object now that the immutable copy is the source of
  // truth. A failure here is a harmless orphan (never served, never in the DB), not an error.
  await args.storage.deleteObject(row.s3Key, signal);
  signal.throwIfAborted();
  return ok({ status: "ready" });
}

interface RequestDownloadArgs {
  actor: AuthUser;
  storage: StorageClient;
  fileId: string;
}

// Reload the row, authorize the parent, then mint a short-lived presigned GET.
export async function requestDownload(
  db: Db,
  args: RequestDownloadArgs,
  signal: AbortSignal,
): Promise<Result<{ url: string }, AppError>> {
  signal.throwIfAborted();

  // Boundary: validate fileId is a uuid before hitting the DB.
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

  // Downloads require status='ready' (data model): an 'uploading' object has not passed the
  // confirmUpload HEAD size/content-type check, so it must never be served (F19). Checked
  // AFTER authz so a non-visible actor cannot probe upload state.
  if (row.status !== "ready") {
    return err(new AppError(ERROR_IDS.FILE_PRESIGN_INVALID, "file not ready for download", {}));
  }

  // Revalidate the live object against the ETag captured at confirm: a still-valid presigned
  // POST could have overwritten the object after confirmation (F31). A changed or missing
  // object is refused rather than served. Rows with a null etag predate the binding and skip.
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
