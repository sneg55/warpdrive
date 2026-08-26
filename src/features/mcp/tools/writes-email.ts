import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { deleteDraft, patchDraft, saveDraft } from "@/features/email/draftRepo";
import { getActorMailbox } from "@/features/email/mailboxOwnership";
import { plainTextToParagraphHtml } from "@/features/email/plainText";
import { toAuthUser } from "@/features/mcp/actorContext";
import {
  type GetCtx,
  getToolActor,
  registerTool,
  resultToTool,
  type ToolRegistry,
  toolError,
} from "./types";

// Recipients are validated as addresses here, unlike the composer's autosave (which must tolerate
// a half-typed chip): a tool call has no partial state to preserve.
const createDraftInput = z.object({
  to: z.array(z.string().email()).min(1).max(100),
  cc: z.array(z.string().email()).max(100).default([]),
  subject: z.string().max(2000).default(""),
  // Plain text, converted to paragraph HTML on the way in. Agents write prose, not markup.
  body: z.string().max(100_000).default(""),
  dealId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
});

// Every field optional: a patch leaves what it does not name alone, so an agent revising one
// sentence does not have to resend the recipients it never touched.
const updateDraftInput = z.object({
  draftId: z.string().uuid(),
  // Empty is allowed here, unlike create: an unsent draft may legitimately have its recipients
  // cleared, and the composer persists an empty list too.
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
      "Create an unsent email draft in the actor's mailbox, optionally linked to a deal and a person. The draft appears in the Drafts folder and on the linked record's Email tab for review before sending.",
    inputSchema: createDraftInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      const mailbox = await getActorMailbox(db, actor.value.id, signal);
      // No mailbox means nowhere to put the draft. Say so rather than inventing an account.
      if (mailbox === null) {
        return toolError(
          new AppError(
            ERROR_IDS.GMAIL_GRANT_REVOKED,
            "no Gmail mailbox is connected for this user",
            {},
          ),
        );
      }
      return resultToTool(
        await saveDraft(
          db,
          {
            actor: toAuthUser(actor.value),
            draft: {
              accountId: mailbox.id,
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
      // Zod strips unknown keys, so a call carrying only draftId (or a misspelled field) would
      // otherwise report success having changed nothing.
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

  // The one destructive tool in the set. A draft is the agent's own unsent text, owner-scoped and
  // not a CRM record, so removing it destroys nothing another user can see. See server.test.ts.
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
