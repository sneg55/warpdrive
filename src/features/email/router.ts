import { z } from "zod";
import { INBOX_PAGE_SIZE } from "@/constants/inbox";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { unwrap } from "@/server/unwrap";
import { listDrafts } from "./draftRepo";
import * as emailReads from "./emailReads";
import { listThreadsForContact, listThreadsForDeal } from "./entityThreadReads";
import { listArchivedThreads, listOutbox, listSentThreads } from "./folderReads";
import { inboxUnreadCount } from "./readState";
import { searchInbox } from "./searchInbox";
import { getThreadNeighbors } from "./threadNeighbors";

export type {
  InboxFilter,
  InboxThread,
  TemplateDetail,
  ThreadMessage,
  ThreadView,
} from "./emailReads";
// Re-export the plain read functions so existing importers (and the test) keep working
// from ./router while the implementations live in ./emailReads (200-line cap).
export { getTemplate, getThread, listInbox, listSignatures, listTemplates } from "./emailReads";

const SIG = (): AbortSignal => AbortSignal.timeout(15_000);

// Validated at the boundary, then trusted. `cursor` is an opaque position the client only ever
// echoes back from a previous page; it narrows the scan and cannot widen visibility.
const inboxCursorSchema = z.object({
  lastMessageAt: z.string().nullable(),
  id: z.string().uuid(),
});

// The linking tabs (all/unmatched/needs_linking) plus the U5 quick-filters. Shared by inbox.list and
// search so both narrow the same way (codex review); default "all" = no quick-filter narrowing.
const inboxFilterSchema = z
  .enum([
    "all",
    "unmatched",
    "needs_linking",
    "shared",
    "private",
    "tracked",
    "to_me",
    "from_contact",
    "linked_open_deal",
  ])
  .default("all");

const folderPageInput = z.object({
  limit: z.number().int().min(1).max(INBOX_PAGE_SIZE).optional(),
  cursor: z.object({ at: z.string(), id: z.string().uuid() }).nullish(),
});

export const emailRouter = router({
  inbox: router({
    list: protectedProcedure
      .input(
        z.object({
          filter: inboxFilterSchema,
          limit: z.number().int().min(1).max(INBOX_PAGE_SIZE).optional(),
          // Named `cursor` so TanStack's useInfiniteQuery can inject it.
          cursor: inboxCursorSchema.nullish(),
        }),
      )
      .query(({ ctx, input }) =>
        emailReads.listInbox(
          ctx.db,
          {
            actor: ctx.actor,
            filter: input.filter,
            limit: input.limit,
            cursor: input.cursor ?? null,
          },
          SIG(),
        ),
      ),
    unreadCount: protectedProcedure.query(({ ctx }) =>
      inboxUnreadCount(ctx.db, { actor: ctx.actor }, SIG()),
    ),
  }),
  thread: router({
    get: protectedProcedure
      .input(z.object({ threadId: z.string().uuid(), allowRemote: z.boolean().default(false) }))
      .query(({ ctx, input }) =>
        unwrap(
          emailReads.getThread(
            ctx.db,
            { actor: ctx.actor, threadId: input.threadId, allowRemote: input.allowRemote },
            SIG(),
          ),
        ),
      ),
    // Reader prev/next navigation (P3): position + neighbor ids over the owner's folder. Null for a
    // non-owner (shared-thread viewer gets no nav) or a thread no longer in the folder.
    neighbors: protectedProcedure
      .input(
        z.object({
          threadId: z.string().uuid(),
          folder: z.enum(["inbox", "sent", "archive"]).default("inbox"),
        }),
      )
      .query(({ ctx, input }) =>
        getThreadNeighbors(
          ctx.db,
          { actor: ctx.actor, threadId: input.threadId, folder: input.folder },
          SIG(),
        ),
      ),
  }),
  templates: router({
    list: protectedProcedure.query(({ ctx }) =>
      emailReads.listTemplates(ctx.db, { actor: ctx.actor }, SIG()),
    ),
    get: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(({ ctx, input }) =>
        unwrap(emailReads.getTemplate(ctx.db, { id: input.id, actor: ctx.actor }, SIG())),
      ),
  }),
  signatures: router({
    list: protectedProcedure.query(({ ctx }) =>
      emailReads.listSignatures(ctx.db, { actor: ctx.actor }, SIG()),
    ),
  }),
  folders: router({
    // Sent and Archive page the same way the Inbox does. Their cursor is (ordered_at, id); the
    // client only ever echoes back a cursor it was given, and it narrows the scan, never widens
    // visibility (both reads are owner-scoped in SQL).
    sent: protectedProcedure.input(folderPageInput).query(({ ctx, input }) =>
      listSentThreads(ctx.db, ctx.actor, SIG(), {
        limit: input.limit,
        cursor: input.cursor ?? null,
      }),
    ),
    archive: protectedProcedure.input(folderPageInput).query(({ ctx, input }) =>
      listArchivedThreads(ctx.db, ctx.actor, SIG(), {
        limit: input.limit,
        cursor: input.cursor ?? null,
      }),
    ),
    outbox: protectedProcedure.query(({ ctx }) => listOutbox(ctx.db, ctx.actor, SIG())),
  }),
  drafts: router({
    list: protectedProcedure.query(({ ctx }) => listDrafts(ctx.db, ctx.actor, SIG())),
  }),
  // Thread summaries linked to a deal / contact, with the same visibility rules as the Inbox.
  // Feed the deal-workspace and contact-detail Email tabs.
  forDeal: protectedProcedure
    .input(z.object({ dealId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      listThreadsForDeal(ctx.db, { actor: ctx.actor, dealId: input.dealId }, SIG()),
    ),
  forContact: protectedProcedure
    .input(z.object({ personId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      listThreadsForContact(ctx.db, { actor: ctx.actor, personId: input.personId }, SIG()),
    ),
  // In-mail search across subject/body/participants, gated by the same canSeeEmail
  // visibility rule as the Inbox. Feeds InboxSearchBar via InboxListClient.
  search: protectedProcedure
    .input(z.object({ q: z.string().min(1).max(200), filter: inboxFilterSchema }))
    .query(({ ctx, input }) =>
      searchInbox(ctx.db, { actor: ctx.actor, q: input.q, filter: input.filter }, SIG()),
    ),
});
