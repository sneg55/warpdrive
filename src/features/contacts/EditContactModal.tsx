"use client";
// Edit dialog for person and organization records. Mirrors MergeDialog's inline panel shell
// and wires submit to the (already Result-typed, self-gating) updatePerson/updateOrg actions.
import type React from "react";
import { useState } from "react";
import type { Organization, Person } from "@/db/schema";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import { readCsrfToken } from "@/utils/csrfCookie";
import { updateOrgAction, updatePersonAction } from "./actions";
import {
  AddressFields,
  type ContactPoint,
  CustomFieldRows,
  cleanAddress,
  nonEmptyPoints,
  PersonBaseFields,
  TextField,
} from "./EditContactForms";

// error id -> human copy. Anything unmapped still surfaces its id so nothing fails silently.
const ERROR_MESSAGES: Record<string, string> = {
  E_AUTH_CSRF: "Your session expired. Refresh the page and try again.",
  E_AUTH_003: "Your session is no longer valid. Sign in again.",
  E_PERM_001: "You do not have permission to edit this record.",
  E_CONTACT_001: "This record could not be found.",
  E_CONTACT_002: "The address could not be saved (invalid).",
  E_CONTACT_008: "Please check the highlighted fields and try again.",
};
function messageFor(id: string): string {
  return ERROR_MESSAGES[id] ?? `Could not save (${id})`;
}

export type EditContactModalProps =
  | {
      kind: "person";
      person: Person;
      defs: CustomFieldDef[];
      onSaved: () => void;
      onClose: () => void;
    }
  | {
      kind: "org";
      org: Organization;
      defs: CustomFieldDef[];
      onSaved: () => void;
      onClose: () => void;
    };

interface EditState {
  name: string;
  emails: ContactPoint[];
  phones: ContactPoint[];
  orgId: string;
  address: Record<string, string>;
  customFields: Record<string, unknown>;
}

function initialState(props: EditContactModalProps): EditState {
  if (props.kind === "person") {
    const p = props.person;
    return {
      name: p.name,
      emails: p.emails,
      phones: p.phones,
      orgId: p.orgId ?? "",
      address: {},
      customFields: { ...(p.customFields as Record<string, unknown>) },
    };
  }
  const o = props.org;
  return {
    name: o.name,
    emails: [],
    phones: [],
    orgId: "",
    address: { ...((o.address as Record<string, string> | null) ?? {}) },
    customFields: { ...(o.customFields as Record<string, unknown>) },
  };
}

export function EditContactModal(props: EditContactModalProps): React.ReactNode {
  const { kind, defs, onSaved, onClose } = props;
  const [state, setState] = useState<EditState>(() => initialState(props));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Org options for the person's org assignment (mirrors AddDealModal); unused for org edits.
  const orgQ = trpc.contacts.orgOptions.useQuery(undefined, { enabled: kind === "person" });
  const orgOptions = orgQ.data ?? [];
  // Hidden built-in fields for this entity (settings > Data fields): a hidden field is not rendered.
  const hiddenQ = trpc.customFields.hiddenBuiltins.useQuery();
  const entity = kind === "person" ? "person" : "organization";
  const hidden = new Set(hiddenQ.data?.[entity] ?? []);

  const set = (patch: Partial<EditState>): void => setState((s) => ({ ...s, ...patch }));
  const setCf = (key: string, next: unknown): void =>
    setState((s) => ({ ...s, customFields: { ...s.customFields, [key]: next } }));

  async function submit(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const csrf = readCsrfToken();
      const result =
        kind === "person"
          ? await updatePersonAction(
              {
                id: props.person.id,
                name: state.name,
                emails: nonEmptyPoints(state.emails),
                phones: nonEmptyPoints(state.phones),
                orgId: state.orgId === "" ? null : state.orgId,
                customFields: state.customFields,
              },
              csrf,
            )
          : await updateOrgAction(
              {
                id: props.org.id,
                name: state.name,
                address: cleanAddress(state.address),
                customFields: state.customFields,
              },
              csrf,
            );
      if (!result.ok) {
        setError(messageFor(result.error.id));
        return;
      }
      onSaved();
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={kind === "person" ? "Edit person" : "Edit organization"}
      className="space-y-3 rounded-md border border-gray-200 p-4"
    >
      <TextField
        id="edit-name"
        label="Name"
        value={state.name}
        onChange={(name) => set({ name })}
      />

      {kind === "person" && (
        <PersonBaseFields
          emails={state.emails}
          phones={state.phones}
          orgId={state.orgId}
          orgOptions={orgOptions}
          onEmails={(emails) => set({ emails })}
          onPhones={(phones) => set({ phones })}
          onOrgId={(orgId) => set({ orgId })}
          hidden={hidden}
        />
      )}

      {kind === "org" && !hidden.has("address") && (
        <AddressFields value={state.address} onChange={(address) => set({ address })} />
      )}

      <CustomFieldRows defs={defs} values={state.customFields} onChange={setCf} />

      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 active:scale-[0.96] transition-transform"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void submit()}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50 active:not-disabled:scale-[0.96] transition-transform"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
