import { z } from "zod";
import { INBOX_PAGE_SIZE } from "@/constants/inbox";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { unwrap } from "@/server/unwrap";
import { listActorMailboxes } from "./actorMailboxes";
import { listDraftsForDeal, listDraftsForPerson } from "./draftEntityReads";
import { listDrafts } from "./draftRepo";
import * as emailReads from "./emailReads";
import { listMessagesForContact, listMessagesForDeal } from "./entityMessageReads";
import { listArchivedThreads, listOutbox, listSentThreads } from "./folderReads";
import { mergeContextProcedure } from "./mergeContextProcedure";
import { getMessage } from "./messageReads";
import { inboxUnreadCount } from "./readState";
import { searchInbox } from "./searchInbox";
import { getThreadNeighbors } from "./threadNeighbors";

export { getThread, listInbox } from "./emailReads";

const SIG = (): AbortSignal => AbortSignal.timeout(15_000);

const inboxCursorSchema = z.object({
  lastMessageAt: z.string().nullable(),
  id: z.string().uuid(),
});

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
  mailbox: z.uuid().optional(),
  limit: z.number().int().min(1).max(INBOX_PAGE_SIZE).optional(),
  cursor: z.object({ at: z.string(), id: z.string().uuid() }).nullish(),
});

export const emailRouter = router({
  mailboxes: protectedProcedure.query(({ ctx }) => listActorMailboxes(ctx.db, ctx.actor.id, SIG())),
  inbox: router({
    list: protectedProcedure
      .input(
        z.object({
          filter: inboxFilterSchema,
          mailbox: z.uuid().optional(),
          limit: z.number().int().min(1).max(INBOX_PAGE_SIZE).optional(),
          cursor: inboxCursorSchema.nullish(),
        }),
      )
      .query(({ ctx, input }) =>
        emailReads.listInbox(
          ctx.db,
          {
            actor: ctx.actor,
            mailbox: input.mailbox,
            filter: input.filter,
            limit: input.limit,
            cursor: input.cursor ?? null,
          },
          SIG(),
        ),
      ),
    unreadCount: protectedProcedure
      .input(z.object({ mailbox: z.uuid().nullable().optional() }).optional())
      .query(({ ctx, input }) =>
        inboxUnreadCount(ctx.db, { actor: ctx.actor, mailbox: input?.mailbox }, SIG()),
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
  mergeContext: mergeContextProcedure,
  signatures: router({
    list: protectedProcedure.query(({ ctx }) =>
      emailReads.listSignatures(ctx.db, { actor: ctx.actor }, SIG()),
    ),
  }),
  folders: router({
    sent: protectedProcedure.input(folderPageInput).query(({ ctx, input }) =>
      listSentThreads(ctx.db, ctx.actor, SIG(), {
        mailbox: input.mailbox,
        limit: input.limit,
        cursor: input.cursor ?? null,
      }),
    ),
    archive: protectedProcedure.input(folderPageInput).query(({ ctx, input }) =>
      listArchivedThreads(ctx.db, ctx.actor, SIG(), {
        mailbox: input.mailbox,
        limit: input.limit,
        cursor: input.cursor ?? null,
      }),
    ),
    outbox: protectedProcedure.query(({ ctx }) => listOutbox(ctx.db, ctx.actor, SIG())),
  }),
  drafts: router({
    list: protectedProcedure.query(({ ctx }) => listDrafts(ctx.db, ctx.actor, SIG())),
    listForDeal: protectedProcedure
      .input(z.object({ dealId: z.string().uuid() }))
      .query(({ ctx, input }) =>
        listDraftsForDeal(ctx.db, { actor: ctx.actor, dealId: input.dealId }, SIG()),
      ),
    listForPerson: protectedProcedure
      .input(z.object({ personId: z.string().uuid() }))
      .query(({ ctx, input }) =>
        listDraftsForPerson(ctx.db, { actor: ctx.actor, personId: input.personId }, SIG()),
      ),
  }),
  listMessagesForDeal: protectedProcedure
    .input(z.object({ dealId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      listMessagesForDeal(ctx.db, { actor: ctx.actor, dealId: input.dealId }, SIG()),
    ),
  listMessagesForContact: protectedProcedure
    .input(z.object({ personId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      listMessagesForContact(ctx.db, { actor: ctx.actor, personId: input.personId }, SIG()),
    ),
  message: router({
    get: protectedProcedure
      .input(z.object({ messageId: z.string().uuid(), allowRemote: z.boolean().default(false) }))
      .query(({ ctx, input }) =>
        unwrap(
          getMessage(
            ctx.db,
            { actor: ctx.actor, messageId: input.messageId, allowRemote: input.allowRemote },
            SIG(),
          ),
        ),
      ),
  }),
  search: protectedProcedure
    .input(
      z.object({
        q: z.string().min(1).max(200),
        filter: inboxFilterSchema,
        mailbox: z.uuid().optional(),
      }),
    )
    .query(({ ctx, input }) =>
      searchInbox(
        ctx.db,
        { actor: ctx.actor, q: input.q, filter: input.filter, mailbox: input.mailbox },
        SIG(),
      ),
    ),
});
