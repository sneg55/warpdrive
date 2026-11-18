import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { INBOX_PAGE_SIZE, MAILBOX_FOLDERS, type MailboxFolder } from "@/constants/inbox";
import { createCaller } from "@/server/trpc/root";
import { assertNever } from "@/types/result";
import { type DecodedCursor, decodeMailboxCursor, encodeMailboxCursor } from "./mailboxCursor";
import { resolveMailboxScope } from "./mailboxScope";
import {
  type GetCtx,
  getToolActor,
  registerTool,
  type ToolRegistry,
  toolError,
  toolResult,
} from "./types";

const mailboxAddress = z.string().email().optional();

const threadListInput = z.object({
  mailbox: mailboxAddress,
  folder: z.enum(MAILBOX_FOLDERS).default("inbox"),
  limit: z.number().int().min(1).max(INBOX_PAGE_SIZE).optional(),
  cursor: z.string().optional(),
});

const searchInput = z.object({
  query: z.string().min(1).max(200),
  mailbox: mailboxAddress,
});

const threadInput = z.object({
  threadId: z.string().uuid(),
  allowRemote: z.boolean().default(false),
});

type Caller = ReturnType<typeof createCaller>;
type PageArgs = { mailbox: string | undefined; limit: number | undefined };

async function listFolder(
  caller: Caller,
  folder: MailboxFolder,
  args: PageArgs,
  decoded: DecodedCursor | null,
): Promise<{ threads: unknown[]; nextCursor: unknown }> {
  switch (folder) {
    case "inbox":
      return caller.email.inbox.list({
        ...args,
        cursor: decoded?.folder === "inbox" ? decoded.cursor : null,
      });
    case "sent":
      return caller.email.folders.sent({
        ...args,
        cursor: decoded?.folder === "sent" ? decoded.cursor : null,
      });
    case "archive":
      return caller.email.folders.archive({
        ...args,
        cursor: decoded?.folder === "archive" ? decoded.cursor : null,
      });
    default:
      return assertNever(folder);
  }
}

export function registerMailboxReadTools(
  server: McpServer,
  registry: ToolRegistry,
  getCtx: GetCtx,
): void {
  registerTool(server, registry, {
    name: "list_mailbox_threads",
    description:
      "List email threads in one mailbox folder (inbox, sent or archive), newest first, including mail not linked to any deal or person. mailbox is an address from list_mailboxes and defaults to the personal mailbox. Pass the returned nextCursor as cursor to get the next page. Read a thread with get_email_thread.",
    inputSchema: threadListInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      const scope = await resolveMailboxScope(getCtx().db, actor.value.id, input.mailbox, signal);
      if (!scope.ok) return toolError(scope.error);
      let decoded: DecodedCursor | null = null;
      if (input.cursor !== undefined) {
        const cursor = decodeMailboxCursor(input.folder, input.cursor);
        if (!cursor.ok) return toolError(cursor.error);
        decoded = cursor.value;
      }
      const page = await listFolder(
        createCaller(getCtx()),
        input.folder,
        { mailbox: scope.value.teamMailboxId, limit: input.limit },
        decoded,
      );
      return toolResult({
        threads: page.threads,
        nextCursor: encodeMailboxCursor(input.folder, page.nextCursor),
      });
    },
  });

  registerTool(server, registry, {
    name: "search_emails",
    description:
      "Search email threads in one mailbox by subject, sender and message text. mailbox is an address from list_mailboxes and defaults to the personal mailbox. Read a hit with get_email_thread.",
    inputSchema: searchInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      const scope = await resolveMailboxScope(getCtx().db, actor.value.id, input.mailbox, signal);
      if (!scope.ok) return toolError(scope.error);
      return toolResult(
        await createCaller(getCtx()).email.search({
          q: input.query,
          mailbox: scope.value.teamMailboxId,
        }),
      );
    },
  });

  registerTool(server, registry, {
    name: "get_email_thread",
    description:
      "Get one email thread with all its messages and sanitized bodies, from any mailbox the actor can use.",
    inputSchema: threadInput,
    run: async (input) => toolResult(await createCaller(getCtx()).email.thread.get(input)),
  });
}
