import { createOrgAction, createPersonAction } from "@/features/contacts/actions";
import type { ContactPoint } from "@/features/deals/AddDealPersonColumn";
import type { EntityCreateState, Option } from "./modalState";

// Drop blank contact rows so an empty row never becomes a "" contact point; mark the first
// remaining row primary (Pipedrive treats the top row as primary).
export function cleanPoints(
  rows: ContactPoint[],
): Array<{ label: string; value: string; primary: boolean }> {
  return rows
    .filter((r) => r.value.trim() !== "")
    .map((r, i) => ({ label: r.label, value: r.value.trim(), primary: i === 0 }));
}

// Non-empty tRPC result to options, else null (used to hide manager-only fields on a 403).
export function optionsOrNull(rows: Option[] | undefined): Option[] | null {
  return rows !== undefined && rows.length > 0
    ? rows.map((r) => ({ id: r.id, name: r.name }))
    : null;
}

type PersonFields = Pick<
  EntityCreateState,
  "personMode" | "personId" | "newPersonName" | "phones" | "emails" | "personCustomFields"
>;
type OrgFields = Pick<EntityCreateState, "orgMode" | "orgId" | "newOrgName" | "orgCustomFields">;

// Resolve the org id for the create: an existing selection, or an org created inline by name.
// Returns null (no org), the id, or { error } to surface inline. Run before resolveNewPersonId so a
// newly created person can be linked to a newly created org.
export async function resolveNewOrgId(
  state: OrgFields,
  csrf: string | null,
): Promise<string | null | { error: string }> {
  if (state.orgMode === "existing") return state.orgId === "" ? null : state.orgId;
  if (state.newOrgName.trim() === "") return null;
  const r = await createOrgAction(
    { name: state.newOrgName.trim(), address: null, customFields: state.orgCustomFields },
    csrf,
  );
  if (!r.ok) return { error: `Could not create organization (${r.error.id})` };
  return r.value.id;
}

// Resolve the person id for the create: an existing selection, or a person created inline from the
// name + contact-point fields, linked to the already-resolved org id. Returns null (no person), the
// id, or { error } to surface inline.
export async function resolveNewPersonId(
  state: PersonFields,
  orgId: string | null,
  csrf: string | null,
): Promise<string | null | { error: string }> {
  if (state.personMode === "existing") return state.personId === "" ? null : state.personId;
  if (state.newPersonName.trim() === "") return null;
  const r = await createPersonAction(
    {
      name: state.newPersonName.trim(),
      phones: cleanPoints(state.phones),
      emails: cleanPoints(state.emails),
      orgId,
      customFields: state.personCustomFields,
    },
    csrf,
  );
  if (!r.ok) return { error: `Could not create person (${r.error.id})` };
  return r.value.id;
}
