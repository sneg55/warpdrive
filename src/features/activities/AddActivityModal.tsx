"use client";
import { Building2, CalendarClock, Clock, User } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, type SelectOption } from "@/components/ui/Select";
import { TimePicker } from "@/components/ui/TimePicker";
import { ACTIVITY_PRIORITIES, ACTIVITY_PRIORITY_KEYS } from "@/constants/activityPriorities";
import { composeDueAtIso } from "@/features/activities/activityTime";
import { ComposerFieldRow } from "@/features/deal-workspace/composer/ComposerFieldRow";
import { TypeIconRail } from "@/features/deal-workspace/composer/TypeIconRail";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { createActivityAction } from "./actions";

// Shared icon size for the composer-style field-row leading icons (matches ActivityComposerInline).
const ICON = "h-4 w-4";

// Quick-add Activity dialog (Pipedrive): type + subject + priority + due date, with optional
// person/organization links. Wired to the CSRF-guarded createActivityAction.
export function AddActivityModal({
  onClose,
  onCreated,
  dealId = null,
  leadId = null,
  defaultDate = "",
  defaultTime = "",
}: {
  onClose: () => void;
  onCreated: () => void;
  // When set (deal detail composer), the new activity is linked to this deal.
  dealId?: string | null;
  // When set (lead detail composer), the new activity is linked to this lead. Mutually
  // exclusive with dealId (single-parent constraint); the two composers never set both.
  leadId?: string | null;
  // Click-to-create prefill (calendar week agenda: clicking an empty hour lane seeds the due
  // date/time from the clicked slot instead of leaving both blank).
  defaultDate?: string;
  defaultTime?: string;
}): React.ReactNode {
  const typesQ = trpc.activities.listTypes.useQuery();
  const peopleQ = trpc.contacts.listPeople.useQuery({ offset: 0, limit: 500 });
  const orgsQ = trpc.contacts.listOrgs.useQuery({ offset: 0, limit: 500 });
  const types = typesQ.data ?? [];

  const [typeId, setTypeId] = useState("");
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState("");
  const [due, setDue] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultTime);
  const [personId, setPersonId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const effectiveTypeId = typeId === "" ? (types[0]?.id ?? "") : typeId;
  // Lead activities must carry a due date: leadTimeline skips dueAt === null rows, so an undated
  // lead activity would save yet never appear. Mirror the deal composer's "require a date" rule.
  const dueRequired = leadId !== null;

  async function submit(): Promise<void> {
    if (subject.trim() === "") {
      setError("Subject is required");
      return;
    }
    if (effectiveTypeId === "") {
      setError("Activity type unavailable");
      return;
    }
    if (dueRequired && due === "") {
      setError("Due date is required");
      return;
    }
    setPending(true);
    setError(null);
    const r = await createActivityAction(
      {
        typeId: effectiveTypeId,
        subject: subject.trim(),
        priority: priority === "" ? null : priority,
        dueAt: due === "" ? null : composeDueAtIso(due, startTime),
        durationMinutes: null,
        dealId,
        leadId,
        personId: personId === "" ? null : personId,
        orgId: orgId === "" ? null : orgId,
        guestPersonIds: [],
        participantUserIds: [],
        customFields: {},
      },
      readCsrfToken(),
    );
    setPending(false);
    if (!r.ok) {
      setError(`Could not create activity (${r.error.id})`);
      return;
    }
    onCreated();
    onClose();
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
          <DialogTitle className="text-base font-semibold">Add activity</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-5 py-4 text-sm">
          {/* Composer parity (deal page): a large subject, the type icon rail, then icon-gutter
              field rows via ComposerFieldRow. Kept the standalone Contact person / Organization
              pickers (the Activities page has no deal/lead context to anchor to). */}
          <input
            aria-label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-md border px-3 py-2 text-[23px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
          />
          <TypeIconRail types={types} value={effectiveTypeId} onChange={setTypeId} />

          <ComposerFieldRow icon={<Clock className={ICON} />}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <DatePicker
                  ariaLabel="Due date"
                  value={due === "" ? null : due}
                  placeholder="Due date"
                  onChange={(v) => setDue(v ?? "")}
                />
              </div>
              <div className="w-28">
                <TimePicker ariaLabel="Start time" value={startTime} onChange={setStartTime} />
              </div>
            </div>
          </ComposerFieldRow>

          <ComposerFieldRow icon={<CalendarClock className={ICON} />}>
            <div className="w-48">
              <Select
                ariaLabel="Priority"
                value={priority}
                onChange={setPriority}
                placeholder="No priority"
                options={[
                  { value: "", label: "No priority" },
                  ...ACTIVITY_PRIORITY_KEYS.map<SelectOption>((k) => ({
                    value: k,
                    label: ACTIVITY_PRIORITIES[k].name,
                  })),
                ]}
              />
            </div>
          </ComposerFieldRow>

          <ComposerFieldRow icon={<User className={ICON} />}>
            <Combobox
              ariaLabel="Contact person"
              value={personId}
              onChange={setPersonId}
              placeholder="Contact person"
              options={[
                { value: "", label: "None" },
                ...(peopleQ.data?.rows ?? []).map<ComboboxOption>((p) => ({
                  value: p.id,
                  label: p.name,
                  avatarName: p.name,
                })),
              ]}
            />
          </ComposerFieldRow>

          <ComposerFieldRow icon={<Building2 className={ICON} />}>
            <Combobox
              ariaLabel="Organization"
              value={orgId}
              onChange={setOrgId}
              placeholder="Organization"
              options={[
                { value: "", label: "None" },
                ...(orgsQ.data?.rows ?? []).map<ComboboxOption>((o) => ({
                  value: o.id,
                  label: o.name,
                })),
              ]}
            />
          </ComposerFieldRow>

          {error !== null && (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-700"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-sm transition-transform hover:bg-accent active:scale-[0.96]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || (dueRequired && due === "")}
            className="rounded-md bg-action px-4 py-1.5 text-sm font-medium text-action-foreground transition-transform hover:opacity-90 active:not-disabled:scale-[0.96] disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
