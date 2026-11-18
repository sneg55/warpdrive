import { eq } from "drizzle-orm";
import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import { createNote } from "@/features/collaboration/notesRepo";
import { updateOrg } from "@/features/contacts/orgsRepo";
import { orgUpdateInput } from "@/features/contacts/schemas";
import { err, ok, type Result } from "@/types/result";
import { applyCreate, authorityError, type ImportActor, type RowError } from "./commitHelpers";
import { findCandidates, findPersonByName } from "./dedup";
import { orgFieldPatch } from "./orgFields";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface EntityLink {
  id: string;
  createdId: string | null;
}

function isPermissionFailure(error: AppError): boolean {
  return error.id === ERROR_IDS.PERM_DENIED || error.id === ERROR_IDS.CONTACT_NOT_FOUND;
}

export async function writeOrgFields(
  tx: Tx,
  actor: ImportActor,
  orgId: string,
  group: Record<string, unknown>,
  onlyBlank: boolean,
  signal: AbortSignal,
): Promise<Result<null, RowError[]>> {
  let existing: Record<string, unknown> | null = null;
  if (onlyBlank) {
    const [row] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
    if (row === undefined) return ok(null);
    existing = row;
  }
  const patch = orgFieldPatch(group, existing, { onlyBlank });
  if (Object.keys(patch).length === 0) return ok(null);

  const parsed = orgUpdateInput.safeParse({ ...patch, id: orgId });
  if (parsed.success === false) {
    return err(
      parsed.error.issues.map((i) => ({
        field: `organization.${i.path.join(".")}`,
        message: i.message,
      })),
    );
  }
  const result = await updateOrg(tx, actor, parsed.data, signal);
  if (result.ok === false) {
    if (onlyBlank && isPermissionFailure(result.error)) return ok(null);
    return err(authorityError(result.error));
  }
  return ok(null);
}

export async function resolveOrgLink(
  tx: Tx,
  actor: ImportActor,
  group: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<EntityLink, RowError[]>> {
  const name = group.name;
  if (typeof name !== "string" || name === "") {
    return err([{ field: "organization.name", message: "organization name is required" }]);
  }
  const cand = await findCandidates(tx, actor, "organization", { name }, signal);
  if (cand.outcome === "ambiguous") {
    return err([
      {
        field: "organization.name",
        message: `ambiguous organization "${name}": ${cand.count} matches`,
      },
    ]);
  }

  if (cand.outcome === "one") {
    const enriched = await writeOrgFields(tx, actor, cand.candidateId, group, true, signal);
    if (enriched.ok === false) return enriched;
    return ok({ id: cand.candidateId, createdId: null });
  }

  const created = await applyCreate(
    tx,
    actor,
    "organization",
    { name, address: group.address ?? null, customFields: {} },
    signal,
  );
  if (created.ok === false) return created;
  const written = await writeOrgFields(tx, actor, created.value, group, false, signal);
  if (written.ok === false) return written;
  return ok({ id: created.value, createdId: created.value });
}

export async function resolvePersonLink(
  tx: Tx,
  actor: ImportActor,
  group: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<EntityLink, RowError[]>> {
  const name = group.name;
  if (typeof name !== "string" || name === "") {
    return err([{ field: "person.name", message: "person name is required" }]);
  }
  const emails = group.emails;
  const hasEmail = Array.isArray(emails) && emails.length > 0;
  const cand = hasEmail
    ? await findCandidates(tx, actor, "person", group, signal)
    : await findPersonByName(tx, actor, name, signal);

  if (cand.outcome === "ambiguous") {
    return err([
      { field: "person.name", message: `ambiguous person "${name}": ${cand.count} matches` },
    ]);
  }
  if (cand.outcome === "one") return ok({ id: cand.candidateId, createdId: null });

  const created = await applyCreate(tx, actor, "person", { ...group, customFields: {} }, signal);
  if (created.ok === false) return created;
  return ok({ id: created.value, createdId: created.value });
}

export type NotableEntity = "deal" | "person" | "organization" | "lead";

export async function createRowNote(
  tx: Tx,
  actor: ImportActor,
  entityType: NotableEntity,
  entityId: string,
  body: string,
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
  const result = await createNote(tx, actor, { entityType, entityId, body, pinned: false }, signal);
  if (result.ok === false) return err(authorityError(result.error));
  return ok(result.value.id);
}
