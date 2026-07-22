"use client";
import { useState } from "react";
import { createActivityAction, editActivityAction } from "@/features/activities/actions";
import type { EditableActivity } from "@/features/activities/getForEdit";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import {
  buildActivityInput,
  buildActivityUpdateInput,
  buildLinkTargets,
  localPartsFromIso,
  todayLocalDateString,
} from "./composerHelpers";
import type { LinkKind, LinkValue } from "./LinkChips";
import { buildParticipantOptions } from "./participantOptions";
import { useComposerAvailability } from "./useComposerAvailability";

export interface ActivityComposerProps {
  // Exactly one of dealId/leadId is set (mirrors the activities table's deal-XOR-lead constraint).
  dealId: string | null;
  leadId?: string | null;
  personId: string | null;
  orgId: string | null;
  personName?: string;
  dealTitle?: string;
  orgName?: string;
  // Called after a successful create OR save; the caller collapses/refreshes.
  onCreated: () => void;
  // When set the composer is in EDIT mode: fields seed from this activity and Save calls the update
  // action instead of create. Absent = create mode.
  editing?: EditableActivity | null;
}

// All state, derived values, and the submit/duplicate handlers for the activity composer. Extracted
// from ActivityComposerInline so the component stays under the file cap and the create-vs-edit
// seeding + submit branching live in one place. Returns flat value/setter pairs consumed by the JSX.
export function useActivityComposer(props: ActivityComposerProps) {
  const { dealId, leadId, personId, orgId, personName, dealTitle, orgName, onCreated } = props;
  const editing = props.editing ?? null;

  const types = trpc.activities.listTypes.useQuery().data ?? [];
  const owners = trpc.identity.assignableUsers.useQuery().data ?? [];
  const orgPeople = trpc.contacts.listPeopleForOrg.useQuery(
    { orgId: orgId ?? "" },
    { enabled: orgId !== null },
  );
  // Participants candidate source: the deal's contact person is always offered (and pre-selected),
  // merged with the org's contacts. See buildParticipantOptions for why org membership isn't enough.
  const participantOptions = buildParticipantOptions(
    orgId !== null ? (orgPeople.data ?? []) : [],
    personId,
    personName,
  );

  const start = localPartsFromIso(editing?.dueAt ?? null);
  const end = localPartsFromIso(editing?.endAt ?? null);

  const [typeId, setTypeId] = useState(editing?.typeId ?? "");
  const [subject, setSubject] = useState(editing?.subject ?? "");
  // subjectEdited stops the type-name prefill ("Call" -> subject "Call") once the user types; it
  // starts locked in edit mode since the stored subject is already the user's own text.
  const [subjectEdited, setSubjectEdited] = useState(editing !== null);
  const [priority, setPriority] = useState(editing?.priority ?? "");
  const [startDate, setStartDate] = useState(
    editing !== null ? start.date : todayLocalDateString(),
  );
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(end.time);
  const [endDate, setEndDate] = useState(end.date);
  const [location, setLocation] = useState(editing?.location ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [videoCallUrl, setVideoCallUrl] = useState(editing?.videoCallUrl ?? "");
  const [ownerId, setOwnerId] = useState(editing?.assigneeId ?? "");
  const [participants, setParticipants] = useState<string[]>(
    editing !== null ? editing.guestPersonIds : personId !== null ? [personId] : [],
  );
  const [links, setLinks] = useState<LinkValue>(
    editing !== null
      ? { deal: editing.dealId, person: editing.personId, org: editing.orgId }
      : { deal: dealId, person: personId, org: orgId },
  );
  const [done, setDone] = useState(editing?.done ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const linkTargets = buildLinkTargets(dealId, personId, orgId, {
    deal: dealTitle,
    person: personName,
    org: orgName,
  });
  function setLink(kind: LinkKind, id: string | null): void {
    setLinks((prev) => ({ ...prev, [kind]: id }));
  }

  const busy = useComposerAvailability({ ownerId, startDate, startTime, endDate, endTime });

  const effectiveTypeId = typeId === "" ? (types[0]?.id ?? "") : typeId;
  const typeName = types.find((t) => t.id === effectiveTypeId)?.name ?? "";
  const subjectValue = subjectEdited ? subject : subject === "" ? typeName : subject;

  function draft() {
    return {
      typeId: effectiveTypeId,
      subject: subjectValue,
      priority,
      startDate,
      startTime,
      endDate,
      endTime,
      links,
      leadId: leadId ?? null,
      location,
      note,
      videoCallUrl,
      done,
      ownerId,
      participants,
    };
  }

  // After a create, clear back to the deal-context defaults for the next activity. Edit mode never
  // resets (the caller closes the composer instead).
  function resetForNext(): void {
    setSubject("");
    setSubjectEdited(false);
    setNote("");
    setLocation("");
    setStartDate(todayLocalDateString());
    setStartTime("");
    setEndTime("");
    setEndDate("");
    setVideoCallUrl("");
    setPriority("");
    setOwnerId("");
    setParticipants(personId !== null ? [personId] : []);
    setLinks({ deal: dealId, person: personId, org: orgId });
    setDone(false);
  }

  async function submit(): Promise<void> {
    if (subjectValue.trim() === "") {
      setError("Subject is required");
      return;
    }
    if (effectiveTypeId === "") {
      setError("Activity type unavailable");
      return;
    }
    if (startDate.trim() === "") {
      setError("Date is required");
      return;
    }
    setPending(true);
    setError(null);
    const csrf = readCsrfToken();
    const r =
      editing !== null
        ? await editActivityAction(buildActivityUpdateInput(editing.id, draft()), csrf)
        : await createActivityAction(buildActivityInput(draft()), csrf);
    setPending(false);
    if (!r.ok) {
      const verb = editing !== null ? "save" : "create";
      setError(`Could not ${verb} activity (${r.error.id})`);
      return;
    }
    if (editing === null) resetForNext();
    onCreated();
  }

  // Duplicate (Pipedrive parity): keep the current field values but start a fresh draft; the subject
  // is locked (subjectEdited) so it survives a later type change, and done resets.
  function duplicate(): void {
    setSubject(subjectValue);
    setSubjectEdited(true);
    setDone(false);
    setError(null);
  }

  return {
    types,
    owners,
    participantOptions,
    linkTargets,
    subjectValue,
    setSubject,
    setSubjectEdited,
    effectiveTypeId,
    setTypeId,
    startDate,
    setStartDate,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    endDate,
    setEndDate,
    busy,
    priority,
    setPriority,
    participants,
    setParticipants,
    location,
    setLocation,
    videoCallUrl,
    setVideoCallUrl,
    note,
    setNote,
    ownerId,
    setOwnerId,
    links,
    setLink,
    error,
    done,
    setDone,
    pending,
    submit,
    duplicate,
  };
}
