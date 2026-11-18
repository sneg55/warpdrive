"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { HiddenRecordNotice } from "@/components/HiddenRecordNotice";
import {
  CustomFieldCreateFields,
  customFieldCreatePayload,
  firstMissingImportantField,
} from "@/features/custom-fields/CustomFieldCreateFields";
import { createFailureMessage, settleCreate } from "@/features/entity-create/createFailure";
import { EntityCreateModalShell } from "@/features/entity-create/EntityCreateModalShell";
import {
  type InlineCreated,
  noInlineCreated,
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
  stageId?: string;
  prefillTitle?: string;
  prefillPerson?: Option;
  onClose: () => void;
  onCreated: (id: string, title: string) => void;
  suppressDetailNav?: boolean;
}

function dealDetailsPath(
  deal: { id: string } | null,
  openAfterCreate: boolean,
  suppressDetailNav: boolean,
): string | null {
  if (deal === null || !openAfterCreate || suppressDetailNav) return null;
  return `/deals/${deal.id}`;
}

export function AddDealModal(props: AddDealModalProps): React.ReactNode {
  const {
    pipelineId,
    pipelines,
    baseCurrency = "USD",
    stageId,
    prefillTitle,
    prefillPerson,
  } = props;
  const { onClose, onCreated, suppressDetailNav = false } = props;
  const router = useRouter();
  const { autoPrefixLeadDealTitles, openDetailsAfterCreate } = useInterfacePrefs();
  const firstStage = pipelines.find((p) => p.id === pipelineId)?.stages[0]?.id ?? "";
  const hasPrefillTitle = prefillTitle !== undefined && prefillTitle.trim() !== "";
  const [state, setState] = useState<AddDealState>(() => {
    const base = initialAddDealState(pipelineId, stageId ?? firstStage);
    const withPerson =
      prefillPerson === undefined
        ? base
        : { ...base, personMode: "existing" as const, personId: prefillPerson.id };
    return hasPrefillTitle ? { ...withPerson, title: prefillTitle } : withPerson;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hiddenTitle, setHiddenTitle] = useState<string | null>(null);
  const inlineCreated = useRef<InlineCreated>(noInlineCreated());

  const peopleQ = trpc.contacts.personOptions.useQuery();
  const orgsQ = trpc.contacts.orgOptions.useQuery();
  const usersQ = trpc.identity.listUsers.useQuery(undefined, { retry: false });
  const groupsQ = trpc.identity.listVisibilityGroups.useQuery(undefined, { retry: false });
  const dealFieldsQ = trpc.customFields.listDefs.useQuery({ target: "deal" });
  const personFieldsQ = trpc.customFields.listDefs.useQuery({ target: "person" });
  const orgFieldsQ = trpc.customFields.listDefs.useQuery({ target: "organization" });

  const set = (patch: Partial<AddDealState>): void => setState((s) => ({ ...s, ...patch }));

  const people = peopleQ.data ?? [];
  const orgs = orgsQ.data ?? [];
  const [titleEdited, setTitleEdited] = useState(hasPrefillTitle);
  const derivedTitle = deriveEntityTitle(state, orgs, people, "deal", autoPrefixLeadDealTitles);
  if (!titleEdited && state.title !== derivedTitle) {
    setState((s) => (s.title === derivedTitle ? s : { ...s, title: derivedTitle }));
  }

  const stages = useMemo(
    () => pipelines.find((p) => p.id === state.pipelineId)?.stages ?? [],
    [pipelines, state.pipelineId],
  );

  function finishCreate(deal: { id: string } | null, title: string): void {
    if (deal === null) {
      router.refresh();
      setHiddenTitle(title);
      return;
    }
    onCreated(deal.id, title);
    onClose();
    const detailsPath = dealDetailsPath(deal, openDetailsAfterCreate.leadDeal, suppressDetailNav);
    if (detailsPath !== null) router.push(detailsPath);
  }

  async function submit(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const csrf = readCsrfToken();
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
      const dealFields = dealFieldsQ.data ?? [];
      const personFields = personFieldsQ.data ?? [];
      const orgFields = orgFieldsQ.data ?? [];
      const missingDealField = firstMissingImportantField(dealFields, state.dealCustomFields);
      if (missingDealField !== null) {
        setError(`${missingDealField.name} is required`);
        return;
      }
      if (state.orgMode === "new") {
        const missingOrgField = firstMissingImportantField(orgFields, state.orgCustomFields);
        if (missingOrgField !== null) {
          setError(`${missingOrgField.name} is required`);
          return;
        }
      }
      if (state.personMode === "new") {
        const missingPersonField = firstMissingImportantField(
          personFields,
          state.personCustomFields,
        );
        if (missingPersonField !== null) {
          setError(`${missingPersonField.name} is required`);
          return;
        }
      }
      const submitState = {
        ...state,
        dealCustomFields: customFieldCreatePayload(dealFields, state.dealCustomFields),
        personCustomFields: customFieldCreatePayload(personFields, state.personCustomFields),
        orgCustomFields: customFieldCreatePayload(orgFields, state.orgCustomFields),
      };
      const orgId = await resolveNewOrgId(submitState, csrf, inlineCreated);
      if (orgId !== null && typeof orgId === "object") {
        setError(orgId.error);
        return;
      }
      const personId = await resolveNewPersonId(submitState, orgId, csrf, inlineCreated);
      if (personId !== null && typeof personId === "object") {
        setError(personId.error);
        return;
      }
      const resolved = {
        ...parsed.input,
        personId,
        orgId,
        customFields: submitState.dealCustomFields,
      };
      const input =
        state.visibilityGroupId === ""
          ? resolved
          : { ...resolved, visibilityGroupId: state.visibilityGroupId };
      const result = await settleCreate(() => createDealAction(input, csrf));
      if (!result.ok) {
        setError(createFailureMessage("deal", result.error.id));
        return;
      }
      finishCreate(result.deal, parsed.input.title);
    } finally {
      setPending(false);
    }
  }

  if (hiddenTitle !== null) {
    return <HiddenRecordNotice entityLabel="Deal" title={hiddenTitle} onDismiss={onClose} />;
  }

  return (
    <EntityCreateModalShell
      title="Add deal"
      personMode={state.personMode}
      phones={state.phones}
      emails={state.emails}
      onPhones={(phones) => set({ phones })}
      onEmails={(emails) => set({ emails })}
      personCustomFields={
        <CustomFieldCreateFields
          title="Person fields"
          defs={personFieldsQ.data ?? []}
          values={state.personCustomFields}
          onChange={(key, value) =>
            set({ personCustomFields: { ...state.personCustomFields, [key]: value } })
          }
        />
      }
      error={error}
      pending={pending}
      submitDisabled={dealFieldsQ.isLoading || personFieldsQ.isLoading || orgFieldsQ.isLoading}
      onSubmit={() => void submit()}
      onClose={onClose}
      leftColumn={
        <AddDealLeftColumn
          state={state}
          initialPerson={prefillPerson}
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
          organizationCustomFields={
            <CustomFieldCreateFields
              title="Organization fields"
              defs={orgFieldsQ.data ?? []}
              values={state.orgCustomFields}
              onChange={(key, value) =>
                set({ orgCustomFields: { ...state.orgCustomFields, [key]: value } })
              }
            />
          }
          dealCustomFields={
            <CustomFieldCreateFields
              title="Deal fields"
              defs={dealFieldsQ.data ?? []}
              values={state.dealCustomFields}
              onChange={(key, value) =>
                set({ dealCustomFields: { ...state.dealCustomFields, [key]: value } })
              }
            />
          }
        />
      }
    />
  );
}
