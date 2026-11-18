import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { deleteDraft, patchDraft, saveDraft } from "@/features/email/draftRepo";
import { plainTextToParagraphHtml } from "@/features/email/plainText";
import { toAuthUser } from "@/features/mcp/actorContext";
import { resolveDraftMailbox } from "./draftMailbox";
import {
  type GetCtx,
  getToolActor,
  registerTool,
  resultToTool,
  type ToolRegistry,
  toolError,
} from "./types";

const createDraftInput = z.object({
  to: z.array(z.string().email()).min(1).max(100),
  cc: z.array(z.string().email()).max(100).default([]),
  subject: z.string().max(2000).default(""),
  body: z.string().max(100_000).default(""),
  dealId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
  mailbox: z.string().email().optional(),
});

const updateDraftInput = z.object({
  draftId: z.string().uuid(),
  to: z.array(z.string().email()).max(100).optional(),
  cc: z.array(z.string().email()).max(100).optional(),
  subject: z.string().max(2000).optional(),
  body: z.string().max(100_000).optional(),
});

const draftRef = z.object({ draftId: z.string().uuid() });

export function registerEmailWriteTools(
  server: McpServer,
  registry: ToolRegistry,
  getCtx: GetCtx,
  db: Db,
): void {
  registerTool(server, registry, {
    name: "create_email_draft",
    description:
      "Create an unsent email draft in the actor's personal mailbox, or in any mailbox listed by list_mailboxes when mailbox is given, optionally linked to a deal and a person. The draft appears in the Drafts folder and on the linked record's Email tab for review before sending.",
    inputSchema: createDraftInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      const mailbox = await resolveDraftMailbox(db, actor.value.id, input.mailbox, signal);
      if (!mailbox.ok) return toolError(mailbox.error);
      return resultToTool(
        await saveDraft(
          db,
          {
            actor: toAuthUser(actor.value),
            draft: {
              accountId: mailbox.value.id,
              subject: input.subject,
              bodyHtml: plainTextToParagraphHtml(input.body),
              toEmails: input.to,
              ccEmails: input.cc,
              linkDealId: input.dealId ?? null,
              linkPersonId: input.personId ?? null,
            },
          },
          signal,
        ),
      );
    },
  });

  registerTool(server, registry, {
    name: "update_email_draft",
    description:
      "Revise an unsent draft the actor owns. Only the fields given are changed; the draft's record links, thread and privacy are preserved. Fails if the draft is not in the actor's mailbox.",
    inputSchema: updateDraftInput,
    run: async (input, signal) => {
      const patch = {
        subject: input.subject,
        bodyHtml: input.body === undefined ? undefined : plainTextToParagraphHtml(input.body),
        toEmails: input.to,
        ccEmails: input.cc,
      };
      if (Object.values(patch).every((v) => v === undefined))
        return toolError(
          new AppError(
            ERROR_IDS.GMAIL_DRAFT_INPUT_INVALID,
            "pass at least one of to, cc, subject or body",
            {},
          ),
        );
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      return resultToTool(
        await patchDraft(
          db,
          {
            actor: toAuthUser(actor.value),
            draftId: input.draftId,
            patch,
          },
          signal,
        ),
      );
    },
  });

  registerTool(server, registry, {
    name: "delete_email_draft",
    description:
      "Delete an unsent draft the actor owns. Fails if the draft is not in the actor's mailbox. Sent email is never affected.",
    inputSchema: draftRef,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      return resultToTool(
        await deleteDraft(db, { actor: toAuthUser(actor.value), draftId: input.draftId }, signal),
      );
    },
  });
}
