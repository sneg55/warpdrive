import type { Db } from "@/db/client";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings } from "./mappingsRepo";
import { prospectMergeBases } from "./prospectMerge";
import { getOwnUnappliedBatch } from "./prospectsRepo";
import { baseFor, revealedFrom } from "./revealProfile";
import type { RevealBatch } from "./revealTypes";

export async function loadRevealBatch(
  db: Db,
  actor: ContactActor,
  input: { orgId: string; batchId: string },
  signal: AbortSignal,
): Promise<RevealBatch> {
  const rows = await getOwnUnappliedBatch(db, input.batchId, input.orgId, actor.id, signal);
  const mappings = await listMappings(db, "person", signal);
  const fingerprint = mappingsFingerprint(mappings);
  if (rows.length === 0) return { items: [], failures: [], mappingsFingerprint: fingerprint };

  const bases = await prospectMergeBases(
    db,
    actor,
    input.orgId,
    rows.map((row) => row.profile),
    mappings,
    signal,
  );
  return {
    items: rows.map((row) => revealedFrom(row, baseFor(bases, row.providerRef), mappings)),
    failures: [],
    mappingsFingerprint: fingerprint,
  };
}
