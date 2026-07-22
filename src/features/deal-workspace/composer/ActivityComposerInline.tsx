"use client";
import { CalendarClock, Clock, Link2, MapPin, StickyNote, User, Users, Video } from "lucide-react";
import type React from "react";
import { Input } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { ACTIVITY_PRIORITIES, ACTIVITY_PRIORITY_KEYS } from "@/constants/activityPriorities";
import { FIELD_INPUT as FIELD } from "@/constants/formStyles";
import { useComposeInitialFocus } from "@/features/compose/useComposeInitialFocus";
import { RichTextBody } from "@/features/email/composer/RichTextBodyLazy";
import { ComposerDisclosureField } from "./ComposerDisclosureField";
import { ComposerFieldRow } from "./ComposerFieldRow";
import { ComposerFooter } from "./ComposerFooter";
import { DateRangeRow } from "./DateRangeRow";
import { FreeBusyIndicator } from "./FreeBusyIndicator";
import { LinkChips } from "./LinkChips";
import { GuestsField, OwnerField } from "./LinkedPeopleFields";
import { TypeIconRail } from "./TypeIconRail";
import { type ActivityComposerProps, useActivityComposer } from "./useActivityComposer";
import { VideoCallField } from "./VideoCallField";

const ICON = "h-4 w-4";

const NO_PRIORITY_LABEL = "No priority";

interface Props extends ActivityComposerProps {
  // Collapses the composer back to its one-line prompt (Cancel button). Optional so scopes that
  // mount the composer without a collapse affordance can omit it (defaults to a no-op).
  onCancel?: () => void;
}

// Create OR edit an activity (edit mode when `editing` is set). All state and the submit branching
// live in useActivityComposer; this component is the field layout (PD's 7-icon rail).
export function ActivityComposerInline(props: Props): React.ReactNode {
  const subjectRef = useComposeInitialFocus<HTMLInputElement>();
  const {
    subjectValue,
    setSubject,
    setSubjectEdited,
    types,
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
    participantOptions,
    participants,
    setParticipants,
    location,
    setLocation,
    videoCallUrl,
    setVideoCallUrl,
    note,
    setNote,
    owners,
    ownerId,
    setOwnerId,
    linkTargets,
    links,
    setLink,
    error,
    done,
    setDone,
    pending,
    submit,
    duplicate,
  } = useActivityComposer(props);

  return (
    <div className="flex flex-col gap-3 p-2 text-sm">
      <Input
        ref={subjectRef}
        data-compose-primary="activity"
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
        onCancel={() => props.onCancel?.()}
        onSave={() => void submit()}
      />
    </div>
  );
}
