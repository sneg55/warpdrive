"use server";

import { z } from "zod";
import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { makeStorageClient, type PresignedPost } from "@/features/files/storage";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { can } from "@/features/permissions/can";
import { createContext } from "@/server/trpc/context";
import { setMapping } from "./batch";
import { loadOwnedBatch } from "./batchHelpers";
import { enqueueCommitJob } from "./commitJob";
import { toImportActor } from "./importActor";
import { columnMappingSchema } from "./schemas";
import { enqueueUndoJob } from "./undoJob";
import { confirmImportUpload, type RequestImportUploadInput, requestImportUpload } from "./upload";
import { enqueueValidateJob } from "./validateJob";

type ActionResult<T> = { ok: true; value: T } | { ok: false; error: { id: string } };

const setMappingInput = z.object({
  batchId: z.string().uuid(),
  mapping: columnMappingSchema,
});
const batchIdInput = z.object({ batchId: z.string().uuid() });

export async function setMappingAction(
  input: z.infer<typeof setMappingInput>,
  csrfToken: string | null = null,
): Promise<ActionResult<{ batchId: string }>> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  if (!can(actor, "data.import")) return { ok: false, error: { id: ERROR_IDS.PERM_DENIED } };

  const { batchId, mapping } = setMappingInput.parse(input);
  // Ownership + legal-state gate: only a freshly prepared batch (mapping_ready) may accept a
  // mapping. Re-mapping a "ready" batch is rejected: validateBatch only re-checks pending/
  // invalid rows, so already-"valid" rows would keep the old mapping's data and commit stale
  // values. The wizard never re-maps, so mapping_ready is the only legal state here.
  const owned = await loadOwnedBatch(db, toImportActor(actor), batchId, SIG());
  if (!owned.ok) return { ok: false, error: { id: owned.error.id } };
  if (owned.value.status !== "mapping_ready") {
    return { ok: false, error: { id: ERROR_IDS.IMPORT_BAD_STATE } };
  }
  const result = await setMapping(db, toImportActor(actor), batchId, mapping, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  await enqueueValidateJob(batchId, SIG());
  return { ok: true, value: result.value };
}

export async function commitBatchAction(
  input: z.infer<typeof batchIdInput>,
  csrfToken: string | null = null,
): Promise<ActionResult<{ imported: number; skipped: number; invalid: number }>> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  if (!can(actor, "data.import")) return { ok: false, error: { id: ERROR_IDS.PERM_DENIED } };

  const { batchId } = batchIdInput.parse(input);
  // Ownership + state gate BEFORE enqueue: the commit job runs as the batch creator, so
  // without this any data.import user could trigger commit of another user's ready batch.
  // loadOwnedBatch enforces caller == owner (or admin); status must be "ready" (validated).
  const owned = await loadOwnedBatch(db, toImportActor(actor), batchId, SIG());
  if (!owned.ok) return { ok: false, error: { id: owned.error.id } };
  if (owned.value.status !== "ready") {
    return { ok: false, error: { id: ERROR_IDS.IMPORT_BAD_STATE } };
  }
  // Commit runs in a background job (import.commit); the wizard follows progress over
  // realtime and reads the exact split via import.getResult once terminal.
  await enqueueCommitJob(batchId, SIG());
  return { ok: true, value: { imported: 0, skipped: 0, invalid: 0 } };
}

export async function requestImportUploadAction(
  input: RequestImportUploadInput,
  csrfToken: string | null = null,
): Promise<ActionResult<{ batchId: string; post: PresignedPost }>> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  if (!can(actor, "data.import")) return { ok: false, error: { id: ERROR_IDS.PERM_DENIED } };

  const result = await requestImportUpload(
    db,
    { actorId: actor.id, storage: makeStorageClient(), input },
    AbortSignal.timeout(8000),
  );
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: result.value };
}

export async function confirmImportUploadAction(
  batchId: string,
  csrfToken: string | null = null,
): Promise<ActionResult<{ batchId: string }>> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  if (!can(actor, "data.import")) return { ok: false, error: { id: ERROR_IDS.PERM_DENIED } };

  if (!z.string().uuid().safeParse(batchId).success) {
    return { ok: false, error: { id: ERROR_IDS.IMPORT_BATCH_NOT_FOUND } };
  }
  const result = await confirmImportUpload(
    db,
    { actorId: actor.id, storage: makeStorageClient(), batchId },
    AbortSignal.timeout(8000),
  );
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: result.value };
}

export async function undoImportAction(
  batchId: string,
  csrfToken: string | null = null,
): Promise<ActionResult<{ batchId: string }>> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  if (!can(actor, "data.import")) return { ok: false, error: { id: ERROR_IDS.PERM_DENIED } };

  if (!z.string().uuid().safeParse(batchId).success) {
    return { ok: false, error: { id: ERROR_IDS.IMPORT_BATCH_NOT_FOUND } };
  }
  const owned = await loadOwnedBatch(db, toImportActor(actor), batchId, SIG());
  if (!owned.ok) return { ok: false, error: { id: owned.error.id } };
  if (owned.value.status !== "completed" && owned.value.status !== "partial") {
    return { ok: false, error: { id: ERROR_IDS.IMPORT_NOT_UNDOABLE } };
  }
  await enqueueUndoJob(batchId, SIG());
  return { ok: true, value: { batchId } };
}
