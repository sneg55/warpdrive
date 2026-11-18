"use client";
import { useState } from "react";
import { createActivityAction, editActivityAction } from "@/features/activities/actions";
import {
  ACTIVITY_CREATE_COPY,
  ACTIVITY_SAVE_COPY,
} from "@/features/activities/activityFailureCopy";
import type { EditableActivity } from "@/features/activities/getForEdit";
import { useInvalidateActivityLists } from "@/features/activities/useInvalidateActivityLists";
import { actionFailureMessage, settleAction } from "@/lib/actionFailure";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import {
  buildActivityInput,
  buildActivityUpdateInput,
  buildEditLinkTargets,
  buildLinkTargets,
  localPartsFromIso,
  todayLocalDateString,
} from "./composerHelpers";
import type { LinkKind, LinkValue } from "./LinkChips";
import { buildParticipantOptions } from "./participantOptions";
import { useComposerAvailability } from "./useComposerAvailability";

export interface ActivityComposerProps {
  dealId: string | null;
  leadId?: string | null;
  personId: string | null;
  orgId: string | null;
  personName?: string;
  dealTitle?: string;
  orgName?: string;
  onCreated: () => void;
  editing?: EditableActivity | null;
}

export function useActivityComposer(props: ActivityComposerProps) {
  const { dealId, leadId, personId, orgId, personName, dealTitle, orgName, onCreated } = props;
  const editing = props.editing ?? null;

  const invalidateActivityLists = useInvalidateActivityLists();
  const types = trpc.activities.listTypes.useQuery().data ?? [];
  const owners = trpc.identity.assignableUsers.useQuery().data ?? [];
  const orgPeople = trpc.contacts.listPeopleForOrg.useQuery(
    { orgId: orgId ?? "" },
    { enabled: orgId !== null },
  );
  const participantOptions = buildParticipantOptions(
    orgId !== null ? (orgPeople.data ?? []) : [],
    personId,
    personName,
  );

  const start = localPartsFromIso(editing?.dueAt ?? null, editing?.allDay ?? false);
  const end = localPartsFromIso(editing?.endAt ?? null);

  const [typeId, setTypeId] = useState(editing?.typeId ?? "");
  const [subject, setSubject] = useState(editing?.subject ?? "");
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

  const pageLinks = { dealId, personId, orgId, dealTitle, personName, orgName };
  const linkTargets =
    editing === null
      ? buildLinkTargets(dealId, personId, orgId, {
          deal: dealTitle,
          person: personName,
          org: orgName,
        })
      : buildEditLinkTargets(editing, pageLinks);
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
    const r = await settleAction(() =>
      editing !== null
        ? editActivityAction(buildActivityUpdateInput(editing.id, draft(), editing), csrf)
        : createActivityAction(buildActivityInput(draft()), csrf),
    );
    if (!r.ok) {
      setPending(false);
      setError(
        actionFailureMessage(
          editing !== null ? ACTIVITY_SAVE_COPY : ACTIVITY_CREATE_COPY,
          r.error.id,
        ),
      );
      return;
    }
    try {
      await invalidateActivityLists();
    } finally {
      setPending(false);
    }
    if (editing === null) resetForNext();
    onCreated();
  }

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
