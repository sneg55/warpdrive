import { createOrgAction, createPersonAction } from "@/features/contacts/actions";
import type { ContactPoint } from "@/features/deals/AddDealPersonColumn";
import { createFailureMessage, settleCreate } from "./createFailure";
import type { EntityCreateState, Option } from "./modalState";

function cleanPoints(
  rows: ContactPoint[],
): Array<{ label: string; value: string; primary: boolean }> {
  return rows
    .filter((r) => r.value.trim() !== "")
    .map((r, i) => ({ label: r.label, value: r.value.trim(), primary: i === 0 }));
}

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

interface RememberedCreate {
  key: string;
  id: string;
}

export interface InlineCreated {
  org: RememberedCreate | null;
  person: RememberedCreate | null;
}

export interface InlineCreatedRef {
  current: InlineCreated;
}

export function noInlineCreated(): InlineCreated {
  return { org: null, person: null };
}

function reuse(remembered: RememberedCreate | null, key: string): string | null {
  return remembered !== null && remembered.key === key ? remembered.id : null;
}

export async function resolveNewOrgId(
  state: OrgFields,
  csrf: string | null,
  created: InlineCreatedRef,
): Promise<string | null | { error: string }> {
  if (state.orgMode === "existing") return state.orgId === "" ? null : state.orgId;
  if (state.newOrgName.trim() === "") return null;
  const input = {
    name: state.newOrgName.trim(),
    address: null,
    customFields: state.orgCustomFields,
  };
  const key = JSON.stringify(input);
  const earlier = reuse(created.current.org, key);
  if (earlier !== null) return earlier;
  const r = await settleCreate(() => createOrgAction(input, csrf));
  if (!r.ok) return { error: createFailureMessage("organization", r.error.id) };
  created.current = { ...created.current, org: { key, id: r.value.id } };
  return r.value.id;
}

export async function resolveNewPersonId(
  state: PersonFields,
  orgId: string | null,
  csrf: string | null,
  created: InlineCreatedRef,
): Promise<string | null | { error: string }> {
  if (state.personMode === "existing") return state.personId === "" ? null : state.personId;
  if (state.newPersonName.trim() === "") return null;
  const input = {
    name: state.newPersonName.trim(),
    phones: cleanPoints(state.phones),
    emails: cleanPoints(state.emails),
    orgId,
    customFields: state.personCustomFields,
  };
  const key = JSON.stringify(input);
  const earlier = reuse(created.current.person, key);
  if (earlier !== null) return earlier;
  const r = await settleCreate(() => createPersonAction(input, csrf));
  if (!r.ok) return { error: createFailureMessage("person", r.error.id) };
  created.current = { ...created.current, person: { key, id: r.value.id } };
  return r.value.id;
}
