import { composeDueAtIso, deriveDurationMinutes } from "@/features/activities/activityTime";
import { isBlankHtml } from "@/features/activities/isBlankHtml";
import type { LinkKind, LinkTarget, LinkValue } from "./LinkChips";

// Draft state the composer submits; kept here so ActivityComposerInline stays under the file cap.
export interface ActivityDraft {
  typeId: string;
  subject: string;
  priority: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  links: LinkValue;
  leadId: string | null;
  location: string;
  note: string;
  videoCallUrl: string;
  done: boolean;
  ownerId: string;
  participants: string[];
}

// Inverse of composeDueAtIso: split a stored ISO timestamp back into the composer's local date
// (YYYY-MM-DD) and time (HH:mm) inputs. Uses local getters to match how composeDueAtIso builds the
// ISO from local parts, so an edit round-trips to the same instant. Empty ISO -> empty inputs.
export function localPartsFromIso(iso: string | null): { date: string; time: string } {
  if (iso === null) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number): string => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time };
}

// Map the composer draft to an activityUpdateInput patch for an existing activity. Mirrors
// buildActivityInput but carries the id and the update-shaped fields (the composer's participants
// are person guests -> guestPersonIds, matching create; participantUserIds is not edited here).
export function buildActivityUpdateInput(id: string, d: ActivityDraft) {
  return {
    id,
    typeId: d.typeId,
    subject: d.subject.trim(),
    priority: d.priority === "" ? null : d.priority,
    dueAt: composeDueAtIso(d.startDate, d.startTime),
    endAt: d.endDate === "" ? null : composeDueAtIso(d.endDate, d.endTime),
    durationMinutes: deriveDurationMinutes(d.startTime, d.endTime),
    dealId: d.links.deal,
    personId: d.links.person,
    orgId: d.links.org,
    location: d.location.trim() === "" ? null : d.location.trim(),
    note: isBlankHtml(d.note) ? null : d.note,
    videoCallUrl: d.videoCallUrl === "" ? null : d.videoCallUrl,
    assigneeId: d.ownerId === "" ? undefined : d.ownerId,
    guestPersonIds: d.participants,
  };
}

// Map the composer draft to the createActivityAction input (nullish/trim normalization in one place).
export function buildActivityInput(d: ActivityDraft) {
  return {
    typeId: d.typeId,
    subject: d.subject.trim(),
    priority: d.priority === "" ? null : d.priority,
    dueAt: composeDueAtIso(d.startDate, d.startTime),
    endAt: d.endDate === "" ? null : composeDueAtIso(d.endDate, d.endTime),
    durationMinutes: deriveDurationMinutes(d.startTime, d.endTime),
    dealId: d.links.deal,
    leadId: d.leadId,
    personId: d.links.person,
    orgId: d.links.org,
    location: d.location.trim() === "" ? null : d.location.trim(),
    note: isBlankHtml(d.note) ? null : d.note,
    videoCallUrl: d.videoCallUrl === "" ? null : d.videoCallUrl,
    done: d.done,
    assigneeId: d.ownerId === "" ? undefined : d.ownerId,
    guestPersonIds: d.participants,
    participantUserIds: [] as string[],
    customFields: {},
  };
}

// The [from, to] window the Free/Busy availability query should cover for the current composer draft.
// `to` uses the end date + time when a multi-day end is set; for a same-day draft it uses the start
// date + the end TIME (so a 10:00-11:00 draft checks the whole hour, not just the 10:00 instant);
// with no end time it collapses to the start instant.
export function availabilityWindow(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): { from: string | null; to: string | null } {
  const from = composeDueAtIso(startDate, startTime);
  const to =
    endDate !== ""
      ? composeDueAtIso(endDate, endTime)
      : endTime !== ""
        ? composeDueAtIso(startDate, endTime)
        : from;
  return { from, to };
}

// Local YYYY-MM-DD for the Start date default. Built from local date parts (not
// toISOString, which is UTC and can land on the wrong calendar day for the user).
export function todayLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const LINK_FALLBACK: Record<LinkKind, string> = {
  deal: "Deal",
  person: "Person",
  org: "Organization",
};

// Build the removable link chips from the composer's deal context (only non-null links).
export function buildLinkTargets(
  dealId: string | null,
  personId: string | null,
  orgId: string | null,
  labels: { deal?: string; person?: string; org?: string },
): LinkTarget[] {
  const targets: LinkTarget[] = [];
  if (dealId !== null)
    targets.push({ kind: "deal", id: dealId, label: labels.deal ?? LINK_FALLBACK.deal });
  if (personId !== null)
    targets.push({ kind: "person", id: personId, label: labels.person ?? LINK_FALLBACK.person });
  if (orgId !== null)
    targets.push({ kind: "org", id: orgId, label: labels.org ?? LINK_FALLBACK.org });
  return targets;
}
