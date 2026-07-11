"use client";
import type React from "react";
import { useState } from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, type SelectOption } from "@/components/ui/Select";
import { TimePicker } from "@/components/ui/TimePicker";
import { ACTIVITY_PRIORITIES, ACTIVITY_PRIORITY_KEYS } from "@/constants/activityPriorities";
import { FIELD_INPUT as FIELD } from "@/constants/formStyles";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ActivityTypeIcon } from "./ActivityTypeIcon";
import { completeActivityAction, deleteActivityAction, editActivityAction } from "./actions";
import { buildActivityPatch, type EditableActivity, isoToLocalParts } from "./activityEditPatch";

const NO_PRIORITY_LABEL = "No priority";

export type { EditableActivity } from "./activityEditPatch";

interface Props {
  activity: EditableActivity;
  onClose: () => void;
  onSaved: () => void;
}

export function ActivityEditModal({ activity, onClose, onSaved }: Props): React.ReactNode {
  const typesQ = trpc.activities.listTypes.useQuery();
  const types = typesQ.data ?? [];
  const initialParts = isoToLocalParts(activity.dueAtIso);

  const [typeId, setTypeId] = useState(activity.typeId);
  // Guard against ActivitiesTable.toEditable opening this modal with typeId: "" (row clicked
  // before its own listTypes resolved). Mirrors AddActivityModal's effectiveTypeId: display-only
  // fallback so the Select never shows blank when types are available. Save still diffs against
  // the raw typeId, so an untouched fallback selection never gets written as a spurious patch.
  const effectiveTypeId = typeId === "" ? (types[0]?.id ?? "") : typeId;
  const [subject, setSubject] = useState(activity.subject);
  const [priority, setPriority] = useState(activity.priority ?? "");
  const [date, setDate] = useState(initialParts.date);
  const [time, setTime] = useState(initialParts.time);
  const [location, setLocation] = useState(activity.location ?? "");
  const [doneNow, setDoneNow] = useState(activity.done);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(): Promise<void> {
    if (subject.trim() === "") {
      setError("Subject is required");
      return;
    }
    const patch = buildActivityPatch(activity, { subject, typeId, priority, date, time, location });
    if (patch === null) {
      onClose();
      return;
    }
    setPending(true);
    setError(null);
    const r = await editActivityAction(patch, readCsrfToken());
    setPending(false);
    if (!r.ok) {
      setError(`Could not save activity (${r.error.id})`);
      return;
    }
    onSaved();
    onClose();
  }

  async function remove(): Promise<void> {
    setPending(true);
    setError(null);
    const r = await deleteActivityAction({ id: activity.id }, readCsrfToken());
    setPending(false);
    if (!r.ok) {
      setError(`Could not delete activity (${r.error.id})`);
      return;
    }
    onSaved();
    onClose();
  }

  async function toggleDone(): Promise<void> {
    const next = !doneNow;
    setPending(true);
    setError(null);
    const r = await completeActivityAction({ id: activity.id, done: next }, readCsrfToken());
    setPending(false);
    if (!r.ok) {
      setError(`Could not update activity (${r.error.id})`);
      return;
    }
    setDoneNow(next);
    onSaved();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="max-w-md gap-0 overflow-hidden bg-card p-0"
      >
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="text-base font-semibold">Edit activity</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-5 py-4 text-sm">
          <div className="block">
            <span className="mb-1 block font-medium">Type</span>
            <Select
              ariaLabel="Activity type"
              value={effectiveTypeId}
              onChange={setTypeId}
              options={types.map<SelectOption>((t) => ({
                value: t.id,
                label: t.name,
                icon: <ActivityTypeIcon typeKey={t.key} />,
              }))}
            />
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">Subject</span>
            <input
              aria-label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={FIELD}
            />
          </label>
          <div className="block">
            <span className="mb-1 block font-medium">Priority</span>
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
          <div className="block">
            <span className="mb-1 block font-medium">Due date</span>
            <DatePicker
              ariaLabel="Due date"
              value={date === "" ? null : date}
              onChange={(v) => setDate(v ?? "")}
            />
          </div>
          <div className="block">
            <span className="mb-1 block font-medium">Start time</span>
            <TimePicker ariaLabel="Start time" value={time} onChange={setTime} />
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">Location</span>
            <input
              aria-label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              className={FIELD}
            />
          </label>

          {error !== null && (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-700"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-sm text-red-700 transition-transform hover:bg-red-50 active:not-disabled:scale-[0.96] disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => void toggleDone()}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-sm transition-transform hover:bg-accent active:not-disabled:scale-[0.96] disabled:opacity-50"
            >
              {doneNow ? "Reopen" : "Mark as done"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-1.5 text-sm transition-transform hover:bg-accent active:scale-[0.96]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={pending}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-transform hover:opacity-90 active:not-disabled:scale-[0.96] disabled:opacity-50"
            >
              {pending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
