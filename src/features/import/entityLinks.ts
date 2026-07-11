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

// A row links to a related record either by matching an existing one or by creating a fresh one.
// The caller needs to know which: only a freshly created record should be tracked for undo, since
// a linked pre-existing record must survive an undo of this import.
export interface EntityLink {
  id: string;
  createdId: string | null;
}

// Enrichment is a best-effort side benefit, never the reason a row fails. If the importer cannot
// see or edit the matched org, the row still imports and links; it just does not enrich.
function isPermissionFailure(error: AppError): boolean {
  return error.id === ERROR_IDS.PERM_DENIED || error.id === ERROR_IDS.CONTACT_NOT_FOUND;
}

// Write the row's organization fields onto an org.
//
// `onlyBlank` distinguishes an org this import just created (take everything) from one that
// already existed (fill gaps only, never overwrite curated data). Goes through the audited
// updateOrg authority rather than raw SQL so permissions and audit hold.
//
// It also decides how a permission denial is treated. Enriching someone ELSE's org is a bonus, so
// a denial there skips the enrichment and the row still imports. Writing the fields of an org this
// row just created is not optional: swallowing a denial there would create a nameless-but-for-name
// org and silently discard every firmographic the user mapped, so it fails the row instead.
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
    // Only the enrichment path (onlyBlank) may swallow a denial; see the note above.
    if (onlyBlank && isPermissionFailure(result.error)) return ok(null);
    return err(authorityError(result.error));
  }
  return ok(null);
}

// Resolve a row's organization group to an orgId: link to the one visible org with that name, or
// find-or-create so a re-import is idempotent. Ambiguous (multiple visible matches) fails the row
// rather than silently guessing. Reuses the visibility-scoped dedup + the audited,
// contact.create-gated org create authority so imported orgs match API-created ones.
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
  // A created org takes every mapped field: there is nothing to protect.
  const written = await writeOrgFields(tx, actor, created.value, group, false, signal);
  if (written.ok === false) return written;
  return ok({ id: created.value, createdId: created.value });
}

// Resolve a deal row's person group to a personId, mirroring resolveOrgLink.
//
// A person's dedup key is the primary email. When the group carries one, match on it. When it does
// not (a deal file that names only the contact), fall back to a visibility-scoped NAME match:
// otherwise re-importing the same file would create a duplicate person on every run.
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

// Notes attach to deal/person/organization/lead only (ENTITY_TYPES), which is why the map step
// offers no Note group on an activity import.
export type NotableEntity = "deal" | "person" | "organization" | "lead";

// Create the row's note against the record the row just created. A note failure is a row failure:
// the checkbox exists precisely so the unmapped columns are not lost, and silently dropping them
// would defeat it.
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
