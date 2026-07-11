"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { DEFAULT_BASE_CURRENCY } from "@/constants/currency";
import { deriveEntityTitle } from "@/features/deals/dealTitleAutofill";
import { EntityCreateModalShell } from "@/features/entity-create/EntityCreateModalShell";
import {
  optionsOrNull,
  resolveNewOrgId,
  resolveNewPersonId,
} from "@/features/entity-create/modalHelpers";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { AddLeadLeftColumn } from "./AddLeadLeftColumn";
import { type AddLeadState, initialAddLeadState } from "./addLeadState";
import { parseNewLead } from "./leadForm";
import { createLeadAction } from "./leadServerActions";

export interface AddLeadModalProps {
  baseCurrency?: string;
  onClose: () => void;
  onCreated: () => void;
}

export function AddLeadModal({
  baseCurrency = DEFAULT_BASE_CURRENCY,
  onClose,
  onCreated,
}: AddLeadModalProps): React.ReactNode {
  const router = useRouter();
  const { autoPrefixLeadDealTitles, openDetailsAfterCreate } = useInterfacePrefs();
  const [state, setState] = useState<AddLeadState>(initialAddLeadState());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const peopleQ = trpc.contacts.personOptions.useQuery();
  const orgsQ = trpc.contacts.orgOptions.useQuery();
  const usersQ = trpc.identity.listUsers.useQuery(undefined, { retry: false });
  const groupsQ = trpc.identity.listVisibilityGroups.useQuery(undefined, { retry: false });

  const set = (patch: Partial<AddLeadState>): void => setState((s) => ({ ...s, ...patch }));

  // Autofill the lead title from the chosen person/org ("{name} lead") until the user edits it.
  const people = peopleQ.data ?? [];
  const orgs = orgsQ.data ?? [];
  const [titleEdited, setTitleEdited] = useState(false);
  const derivedTitle = deriveEntityTitle(state, orgs, people, "lead", autoPrefixLeadDealTitles);
  // Derived during render: an effect would paint the stale title for a frame, then correct it.
  if (!titleEdited && state.title !== derivedTitle) {
    setState((s) => (s.title === derivedTitle ? s : { ...s, title: derivedTitle }));
  }

  async function submit(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const csrf = readCsrfToken();
      // Validate the lead fields BEFORE creating any inline org/person, so an invalid lead (e.g.
      // blank title) can never leave an orphaned org/person behind or duplicate one on retry.
      const parsed = parseNewLead({
        title: state.title,
        value: state.value,
        personId: null,
        orgId: null,
        labels: state.labels,
        sourceChannel: state.sourceChannel,
        sourceChannelId: state.sourceChannelId,
        expectedCloseDate: state.expectedCloseDate,
        ownerId: state.ownerId,
        visibilityGroupId: state.visibilityGroupId,
      });
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      const orgId = await resolveNewOrgId(state, csrf);
      if (orgId !== null && typeof orgId === "object") {
        setError(orgId.error);
        return;
      }
      const personId = await resolveNewPersonId(state, orgId, csrf);
      if (personId !== null && typeof personId === "object") {
        setError(personId.error);
        return;
      }
      const result = await createLeadAction({ ...parsed.input, personId, orgId }, csrf);
      if (!result.ok) {
        setError(`Could not create lead (${result.error.id})`);
        return;
      }
      onCreated();
      onClose();
      // "Open details view after creating a new item" (personal preference): leads share the
      // lead/deal flag with deals. Otherwise the caller's onCreated handles the refresh.
      if (openDetailsAfterCreate.leadDeal) router.push(`/leads/${result.value.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <EntityCreateModalShell
      title="Add lead"
      personMode={state.personMode}
      phones={state.phones}
      emails={state.emails}
      onPhones={(phones) => set({ phones })}
      onEmails={(emails) => set({ emails })}
      error={error}
      pending={pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      leftColumn={
        <AddLeadLeftColumn
          state={state}
          set={set}
          onTitleChange={(v) => {
            setTitleEdited(true);
            set({ title: v });
          }}
          people={peopleQ.data ?? []}
          orgs={orgsQ.data ?? []}
          owners={optionsOrNull(usersQ.data)}
          groups={optionsOrNull(groupsQ.data)}
          baseCurrency={baseCurrency}
        />
      }
    />
  );
}
