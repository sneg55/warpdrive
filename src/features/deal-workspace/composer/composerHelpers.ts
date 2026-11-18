import {
  composeDueAt,
  composeDueAtIso,
  deriveDurationMinutes,
} from "@/features/activities/activityTime";
import { isBlankHtml } from "@/features/activities/isBlankHtml";
import type { LinkKind, LinkTarget, LinkValue } from "./LinkChips";

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

export function localPartsFromIso(
  iso: string | null,
  allDay = false,
): { date: string; time: string } {
  if (iso === null) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number): string => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = allDay ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time };
}

function composedDue(d: ActivityDraft): { dueAt: string | null; allDay: boolean } {
  const { iso, allDay } = composeDueAt(d.startDate, d.startTime);
  return { dueAt: iso, allDay };
}

type StoredLinks = Pick<OwnLinks, "dealId" | "personId" | "orgId">;

function changedLinks(links: LinkValue, stored: StoredLinks) {
  return {
    ...(links.deal === stored.dealId ? {} : { dealId: links.deal }),
    ...(links.person === stored.personId ? {} : { personId: links.person }),
    ...(links.org === stored.orgId ? {} : { orgId: links.org }),
  };
}

export function buildActivityUpdateInput(id: string, d: ActivityDraft, stored: StoredLinks) {
  return {
    id,
    typeId: d.typeId,
    subject: d.subject.trim(),
    priority: d.priority === "" ? null : d.priority,
    ...composedDue(d),
    endAt: d.endDate === "" ? null : composeDueAtIso(d.endDate, d.endTime),
    durationMinutes: deriveDurationMinutes(d.startTime, d.endTime),
    ...changedLinks(d.links, stored),
    location: d.location.trim() === "" ? null : d.location.trim(),
    note: isBlankHtml(d.note) ? null : d.note,
    videoCallUrl: d.videoCallUrl === "" ? null : d.videoCallUrl,
    assigneeId: d.ownerId === "" ? undefined : d.ownerId,
    guestPersonIds: d.participants,
  };
}

export function buildActivityInput(d: ActivityDraft) {
  return {
    typeId: d.typeId,
    subject: d.subject.trim(),
    priority: d.priority === "" ? null : d.priority,
    ...composedDue(d),
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

interface OwnLinks {
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
  dealTitle: string | null;
  personName: string | null;
  orgName: string | null;
}

interface PageLinkContext {
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
  dealTitle?: string;
  personName?: string;
  orgName?: string;
}

function editTarget(
  kind: LinkKind,
  ownId: string | null,
  ownName: string | null,
  pageId: string | null,
  pageLabel?: string,
): LinkTarget | null {
  if (ownId !== null) return ownName === null ? null : { kind, id: ownId, label: ownName };
  if (pageId === null) return null;
  return { kind, id: pageId, label: pageLabel ?? LINK_FALLBACK[kind] };
}

export function buildEditLinkTargets(own: OwnLinks, page: PageLinkContext): LinkTarget[] {
  return [
    editTarget("deal", own.dealId, own.dealTitle, page.dealId, page.dealTitle),
    editTarget("person", own.personId, own.personName, page.personId, page.personName),
    editTarget("org", own.orgId, own.orgName, page.orgId, page.orgName),
  ].filter((t): t is LinkTarget => t !== null);
}
