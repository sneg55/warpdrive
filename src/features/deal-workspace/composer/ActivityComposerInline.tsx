"use client";
import { CalendarClock, Clock, Link2, MapPin, StickyNote, User, Users, Video } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { ACTIVITY_PRIORITIES, ACTIVITY_PRIORITY_KEYS } from "@/constants/activityPriorities";
import { FIELD_INPUT as FIELD } from "@/constants/formStyles";
import { createActivityAction } from "@/features/activities/actions";
import { RichTextBody } from "@/features/email/composer/RichTextBodyLazy";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ComposerDisclosureField } from "./ComposerDisclosureField";
import { ComposerFieldRow } from "./ComposerFieldRow";
import { ComposerFooter } from "./ComposerFooter";
import { buildActivityInput, buildLinkTargets, todayLocalDateString } from "./composerHelpers";
import { DateRangeRow } from "./DateRangeRow";
import { FreeBusyIndicator } from "./FreeBusyIndicator";
import { LinkChips, type LinkKind, type LinkValue } from "./LinkChips";
import { GuestsField, OwnerField } from "./LinkedPeopleFields";
import { buildParticipantOptions } from "./participantOptions";
import { TypeIconRail } from "./TypeIconRail";
import { useComposerAvailability } from "./useComposerAvailability";
import { VideoCallField } from "./VideoCallField";

const ICON = "h-4 w-4";

const NO_PRIORITY_LABEL = "No priority";

interface Props {
  // Exactly one of dealId/leadId is set (mirrors the activities table's deal-XOR-lead
  // constraint); the caller derives this from ComposeScope via activityAnchor().
  dealId: string | null;
  leadId?: string | null;
  personId: string | null;
  orgId: string | null;
  // Real name of the linked person, used for the no-org participant fallback option and the
  // person link chip. Deal/org titles feed their link chips (fallback labels otherwise).
  personName?: string;
  dealTitle?: string;
  orgName?: string;
  onCreated: () => void;
  // Collapses the composer back to its one-line prompt (Cancel button). Optional so scopes that
  // mount the composer without a collapse affordance can omit it (defaults to a no-op).
  onCancel?: () => void;
}

export function ActivityComposerInline({
  dealId,
  leadId,
  personId,
  orgId,
  personName,
  dealTitle,
  orgName,
  onCreated,
  onCancel,
}: Props): React.ReactNode {
  const typesQ = trpc.activities.listTypes.useQuery();
  const usersQ = trpc.identity.assignableUsers.useQuery();
  const orgPeopleQ = trpc.contacts.listPeopleForOrg.useQuery(
    { orgId: orgId ?? "" },
    { enabled: orgId !== null },
  );
  const types = typesQ.data ?? [];
  const owners = usersQ.data ?? [];
  // Participants candidate source: the deal's own contact person is always offered
  // (and pre-selected below), merged with the org's contacts. See buildParticipantOptions
  // for why org membership alone is not enough.
  const participantOptions = buildParticipantOptions(
    orgId !== null ? (orgPeopleQ.data ?? []) : [],
    personId,
    personName,
  );

  const [typeId, setTypeId] = useState("");
  const [subject, setSubject] = useState("");
  // Tracks whether the user has hand-edited the subject, so the type-name prefill
  // (Pipedrive parity: selecting "Call" defaults the subject to "Call") only applies
  // until the user types their own subject, and never clobbers it after that.
  const [subjectEdited, setSubjectEdited] = useState(false);
  const [priority, setPriority] = useState("");
  const [startDate, setStartDate] = useState(() => todayLocalDateString());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // Multi-day end date (Pipedrive parity); empty means a same-day activity.
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  // Generated video-call link (B3); empty means none. Bound to VideoCallField.
  const [videoCallUrl, setVideoCallUrl] = useState("");
  const [ownerId, setOwnerId] = useState("");
  // Pipedrive parity: the deal's linked contact starts as a participant.
  const [participants, setParticipants] = useState<string[]>(personId !== null ? [personId] : []);
  // Re-linkable Deal/Person/Org state, seeded from the deal context; removing a chip nulls one.
  const [links, setLinks] = useState<LinkValue>({ deal: dealId, person: personId, org: orgId });
  const [done, setDone] = useState(false);
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
  // Prefill from the selected type until the user edits the subject themselves.
  const subjectValue = subjectEdited ? subject : subject === "" ? typeName : subject;

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
    const r = await createActivityAction(
      buildActivityInput({
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
      }),
      readCsrfToken(),
    );
    setPending(false);
    if (!r.ok) {
      setError(`Could not create activity (${r.error.id})`);
      return;
    }
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
    // Re-seed the link chips to the deal context for the next activity.
    setLinks({ deal: dealId, person: personId, org: orgId });
    setDone(false);
    onCreated();
  }

  // Duplicate (Pipedrive parity): keep the current field values but start a fresh draft.
  // The subject is locked (subjectEdited) so it survives a later type change, and done resets.
  function duplicate(): void {
    setSubject(subjectValue);
    setSubjectEdited(true);
    setDone(false);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3 p-2 text-sm">
      <input
        aria-label="Subject"
        value={subjectValue}
        onChange={(e) => {
          setSubject(e.target.value);
          setSubjectEdited(true);
        }}
        placeholder="Subject"
        className="w-full rounded-md border px-3 py-2 text-[23px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
      />
      <TypeIconRail types={types} value={effectiveTypeId} onChange={setTypeId} />

      {/* Each field sits in a ComposerFieldRow with PD's leading-icon gutter (the "7-icon rail"). */}
      <ComposerFieldRow icon={<Clock className={ICON} />}>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeRow
            startDate={startDate}
            onStartDate={setStartDate}
            startTime={startTime}
            onStartTime={setStartTime}
            endTime={endTime}
            onEndTime={setEndTime}
            endDate={endDate}
            onEndDate={setEndDate}
          />
          <FreeBusyIndicator busy={busy} />
        </div>
      </ComposerFieldRow>

      <ComposerFieldRow icon={<CalendarClock className={ICON} />}>
        <div className="w-48">
          <Select
            ariaLabel="Priority"
            value={priority}
            onChange={setPriority}
            placeholder={NO_PRIORITY_LABEL}
            options={[
              { value: "", label: NO_PRIORITY_LABEL },
              ...ACTIVITY_PRIORITY_KEYS.map<SelectOption>((k) => ({
                value: k,
                label: ACTIVITY_PRIORITIES[k].name,
              })),
            ]}
          />
        </div>
      </ComposerFieldRow>

      {/* Guests / Location / Video call are PD-style expandable link rows (progressive disclosure);
          Guests starts open because the deal's contact is pre-selected as a participant. */}
      <ComposerFieldRow icon={<Users className={ICON} />} iconAlign="top">
        <GuestsField
          participantOptions={participantOptions}
          participants={participants}
          onParticipants={setParticipants}
        />
      </ComposerFieldRow>

      <ComposerFieldRow icon={<MapPin className={ICON} />}>
        <ComposerDisclosureField label="Location" hasValue={location !== ""}>
          <input
            aria-label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Add location"
            className={FIELD}
          />
        </ComposerDisclosureField>
      </ComposerFieldRow>

      <ComposerFieldRow icon={<Video className={ICON} />}>
        <ComposerDisclosureField label="Video call" hasValue={videoCallUrl !== ""}>
          <VideoCallField value={videoCallUrl} onChange={setVideoCallUrl} />
        </ComposerDisclosureField>
      </ComposerFieldRow>

      {/* Note: the edit surface uses the same amber tint as the Notes tab (ComposeNoteTab's
          bg-warning/10), so switching composer tabs does not change the note background. */}
      <ComposerFieldRow icon={<StickyNote className={ICON} />} iconAlign="top">
        <div data-testid="note-surface" className="overflow-hidden rounded-md border bg-warning/10">
          <RichTextBody html={note} onChange={setNote} contentClassName="bg-transparent" />
        </div>
      </ComposerFieldRow>

      <ComposerFieldRow icon={<User className={ICON} />}>
        <OwnerField owners={owners} ownerId={ownerId} onOwner={setOwnerId} />
      </ComposerFieldRow>

      {/* Linked deal/person/org rows sit at the bottom of the form, matching PD's arrangement. */}
      <ComposerFieldRow icon={<Link2 className={ICON} />} iconAlign="top">
        <LinkChips targets={linkTargets} value={links} onChange={setLink} />
      </ComposerFieldRow>

      {error !== null && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-700"
        >
          {error}
        </p>
      )}

      <ComposerFooter
        done={done}
        onDone={setDone}
        pending={pending}
        onDuplicate={duplicate}
        onCancel={() => onCancel?.()}
        onSave={() => void submit()}
      />
    </div>
  );
}
