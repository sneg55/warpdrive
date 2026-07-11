// Lead detail timeline: unions lead notes (entity_type='lead'), lead-scoped activities
// (activities.lead_id), lead change-log rows (change_logs where entity_type='lead', e.g. label/
// owner edits and the convert-to-deal event), and lead-scoped email (email_threads.lead_id) into
// one feed. Notes + activities + changelog are shaped through the shared buildHistoryTimeline so
// the lead feed renders with the same cards as the deal workspace; email is returned separately
// (the Email tab), mirroring the deal workspace which keeps email out of the interleaved history
// model.
import { and, desc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";
import { activities, activityTypes, emailMessages, emailThreads, notes, users } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import type { CalendarActivity } from "@/features/activities/calendar";
import { listChangeLog } from "@/features/collaboration/changeLog";
import {
  buildHistoryTimeline,
  type HistoryItem,
  type NoteItem,
} from "@/features/deal-workspace/historyTimeline";
import type { DealVisibilitySession } from "@/types/session";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;

export interface LeadTimelineEmail {
  id: string;
  subject: string | null;
  snippet: string | null;
  direction: string;
  fromEmail: string;
  sentAt: Date | null;
}

export interface LeadTimelineResult {
  items: HistoryItem[];
  emails: LeadTimelineEmail[];
}

const EMPTY: LeadTimelineResult = { items: [], emails: [] };

// Feed for a single lead, gated by leadVisibilityClause: an actor who cannot see the lead gets an
// empty feed (never leak note/activity/email existence).
export async function leadTimeline(
  db: Db,
  session: DealVisibilitySession,
  leadId: string,
  signal: AbortSignal,
): Promise<LeadTimelineResult> {
  signal.throwIfAborted();
  const [visible] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt), leadVisibilityClause(session)));
  if (visible === undefined) return EMPTY;
  signal.throwIfAborted();

  const noteRows = await db
    .select({
      id: notes.id,
      body: notes.body,
      createdAt: notes.createdAt,
      actorName: users.name,
    })
    .from(notes)
    .leftJoin(users, eq(users.id, notes.authorId))
    .where(and(eq(notes.entityType, "lead"), eq(notes.entityId, leadId), isNull(notes.deletedAt)))
    .orderBy(desc(notes.createdAt));
  const noteItems: NoteItem[] = noteRows.map((n) => ({
    id: n.id,
    body: n.body,
    createdAt: n.createdAt,
    actorName: n.actorName,
  }));
  signal.throwIfAborted();

  const now = Date.now();
  const activityRows = await db
    .select({
      id: activities.id,
      subject: activities.subject,
      dueAt: activities.dueAt,
      durationMinutes: activities.durationMinutes,
      typeKey: activityTypes.key,
      done: activities.done,
      doneAt: activities.doneAt,
      videoCallUrl: activities.videoCallUrl,
      ownerName: users.name,
    })
    .from(activities)
    .innerJoin(activityTypes, eq(activities.typeId, activityTypes.id))
    .leftJoin(users, eq(users.id, activities.ownerId))
    .where(and(eq(activities.leadId, leadId), isNull(activities.deletedAt)));
  const activityItems: CalendarActivity[] = [];
  for (const row of activityRows) {
    if (row.dueAt === null) continue;
    activityItems.push({
      id: row.id,
      subject: row.subject,
      dueAt: row.dueAt,
      durationMinutes: row.durationMinutes,
      typeKey: row.typeKey,
      done: row.done,
      doneAt: row.doneAt,
      videoCallUrl: row.videoCallUrl,
      dealId: null,
      personId: null,
      orgId: null,
      overdue: row.done === false && row.dueAt.getTime() < now,
      ownerName: row.ownerName,
    });
  }
  signal.throwIfAborted();

  const emailRows = await db
    .select({
      id: emailMessages.id,
      subject: emailMessages.subject,
      snippet: emailMessages.snippet,
      direction: emailMessages.direction,
      fromEmail: emailMessages.fromEmail,
      sentAt: emailMessages.sentAt,
    })
    .from(emailMessages)
    .innerJoin(emailThreads, eq(emailThreads.id, emailMessages.threadId))
    // Exclude trashed threads (P4): a conversation moved to Gmail Trash leaves every view, the lead
    // Email tab included.
    .where(and(eq(emailThreads.leadId, leadId), isNull(emailThreads.trashedAt)))
    .orderBy(desc(emailMessages.sentAt));
  signal.throwIfAborted();

  const changelog = await listChangeLog(db, "lead", leadId, signal);
  signal.throwIfAborted();

  return {
    items: buildHistoryTimeline(activityItems, changelog, noteItems),
    emails: emailRows,
  };
}
