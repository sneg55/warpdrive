"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useMemo, useState } from "react";
import { EntityCreateModalShell } from "@/features/entity-create/EntityCreateModalShell";
import {
  optionsOrNull,
  resolveNewOrgId,
  resolveNewPersonId,
} from "@/features/entity-create/modalHelpers";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { AddDealLeftColumn } from "./AddDealLeftColumn";
import { type AddDealState, initialAddDealState } from "./addDealState";
import { createDealAction } from "./createDealAction";
import { deriveEntityTitle } from "./dealTitleAutofill";
import { parseNewDeal } from "./newDealForm";

interface Option {
  id: string;
  name: string;
}
interface PipelineOption extends Option {
  stages: Option[];
}

export interface AddDealModalProps {
  pipelineId: string;
  pipelines: PipelineOption[];
  baseCurrency?: string;
  // Optional initial stage (per-stage "+" add button). Defaults to the pipeline's first stage.
  stageId?: string;
  // Optional initial title (inbox sidebar seeds this from the thread subject). Locks title autofill.
  prefillTitle?: string;
  onClose: () => void;
  // Receives the new deal's id and (validated, post-trim) title so a caller can auto-link and
  // display it without a second fetch (inbox sidebar, compose-time link sidebar); existing
  // callers that pass a zero-arg refresh handler stay assignable (a function may ignore
  // trailing parameters).
  onCreated: (id: string, title: string) => void;
  // Skip the "jump to /deals/:id after create" navigation even when the user's
  // openDetailsAfterCreate.leadDeal preference is on. Defaults to false so every existing
  // caller keeps navigating. Set true by callers whose surface would be abandoned by a
  // full-page nav away, e.g. the inbox compose link sidebar (ComposeLinkSidebar): the deal
  // link is only local state there until the email is sent, so navigating away loses it.
  suppressDetailNav?: boolean;
}

export function AddDealModal(props: AddDealModalProps): React.ReactNode {
  const { pipelineId, pipelines, baseCurrency = "USD", stageId, prefillTitle } = props;
  const { onClose, onCreated, suppressDetailNav = false } = props;
  const router = useRouter();
  const { autoPrefixLeadDealTitles, openDetailsAfterCreate } = useInterfacePrefs();
  const firstStage = pipelines.find((p) => p.id === pipelineId)?.stages[0]?.id ?? "";
  const hasPrefillTitle = prefillTitle !== undefined && prefillTitle.trim() !== "";
  const [state, setState] = useState<AddDealState>(() => {
    const base = initialAddDealState(pipelineId, stageId ?? firstStage);
    return hasPrefillTitle ? { ...base, title: prefillTitle } : base;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const peopleQ = trpc.contacts.personOptions.useQuery();
  const orgsQ = trpc.contacts.orgOptions.useQuery();
  // Manager-only lists: on a 403 the data stays undefined and the field is hidden.
  const usersQ = trpc.identity.listUsers.useQuery(undefined, { retry: false });
  const groupsQ = trpc.identity.listVisibilityGroups.useQuery(undefined, { retry: false });

  const set = (patch: Partial<AddDealState>): void => setState((s) => ({ ...s, ...patch }));

  // Autofill the title from the chosen person/org ("{name} deal") until the user edits it
  // themselves. Mirrors the derived value into state so submit uses it. `titleEdited` locks it once
  // the user types their own title.
  const people = peopleQ.data ?? [];
  const orgs = orgsQ.data ?? [];
  // A prefilled title (inbox subject) counts as user-set, so the person/org autofill never clobbers it.
  const [titleEdited, setTitleEdited] = useState(hasPrefillTitle);
  const derivedTitle = deriveEntityTitle(state, orgs, people, "deal", autoPrefixLeadDealTitles);
  // Derived during render: an effect would paint the stale title for a frame, then correct it.
  if (!titleEdited && state.title !== derivedTitle) {
    setState((s) => (s.title === derivedTitle ? s : { ...s, title: derivedTitle }));
  }

  const stages = useMemo(
    () => pipelines.find((p) => p.id === state.pipelineId)?.stages ?? [],
    [pipelines, state.pipelineId],
  );

  async function submit(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const csrf = readCsrfToken();
      // Validate the deal fields BEFORE creating any inline org/person, so an invalid deal (e.g.
      // blank title) can never leave an orphaned org/person behind or duplicate one on retry.
      const parsed = parseNewDeal(
        {
          title: state.title,
          stageId: state.stageId,
          value: state.value,
          personId: null,
          orgId: null,
          labels: state.labels,
          sourceChannel: state.sourceChannel,
          sourceChannelId: state.sourceChannelId,
          expectedCloseDate: state.expectedCloseDate,
          ownerId: state.ownerId,
        },
        state.pipelineId,
      );
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
      const resolved = { ...parsed.input, personId, orgId };
      const input =
        state.visibilityGroupId === ""
          ? resolved
          : { ...resolved, visibilityGroupId: state.visibilityGroupId };
      const result = await createDealAction(input, csrf);
      if (!result.ok) {
        setError(`Could not create deal (${result.error.id})`);
        return;
      }
      onCreated(result.deal.id, parsed.input.title);
      onClose();
      // "Open details view after creating a new item" (personal preference): jump to the new deal
      // when the lead/deal flag is on. Otherwise the caller's onCreated handles the refresh.
      // suppressDetailNav opts a caller out entirely (e.g. the inbox compose sidebar, where the
      // deal link is unsent local state that a full-page nav would abandon).
      if (openDetailsAfterCreate.leadDeal && !suppressDetailNav) {
        router.push(`/deals/${result.deal.id}`);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <EntityCreateModalShell
      title="Add deal"
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
        <AddDealLeftColumn
          state={state}
          set={set}
          onTitleChange={(v) => {
            setTitleEdited(true);
            set({ title: v });
          }}
          people={peopleQ.data ?? []}
          orgs={orgsQ.data ?? []}
          pipelines={pipelines}
          stages={stages}
          owners={optionsOrNull(usersQ.data)}
          groups={optionsOrNull(groupsQ.data)}
          baseCurrency={baseCurrency}
        />
      }
    />
  );
}
