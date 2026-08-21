import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { createCaller } from "@/server/trpc/root";
import { type GetCtx, registerTool, type ToolRegistry, toolError, toolResult } from "./types";

// Both ids optional so the tool can be called for either record. Enforced in the handler rather
// than with .refine(), which would make this a ZodEffects and registerTool needs a plain object.
const recordScope = z.object({
  dealId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
});
const messageInput = z.object({
  messageId: z.string().uuid(),
  allowRemote: z.boolean().default(false),
});

const NO_SCOPE = (): AppError =>
  new AppError(ERROR_IDS.GMAIL_READ_INPUT_INVALID, "pass a dealId or a personId", {});

export function registerEmailReadTools(
  server: McpServer,
  registry: ToolRegistry,
  getCtx: GetCtx,
): void {
  const caller = (): ReturnType<typeof createCaller> => createCaller(getCtx());

  registerTool(server, registry, {
    name: "list_emails",
    description:
      "List the email messages linked to a deal or a person, newest first. Bodies are not included; read one with get_email.",
    inputSchema: recordScope,
    run: async (input) => {
      if (input.dealId !== undefined) {
        return toolResult(await caller().email.listMessagesForDeal({ dealId: input.dealId }));
      }
      if (input.personId !== undefined) {
        return toolResult(
          await caller().email.listMessagesForContact({ personId: input.personId }),
        );
      }
      return toolError(NO_SCOPE());
    },
  });

  registerTool(server, registry, {
    name: "get_email",
    description: "Get one email message with its sanitized body",
    inputSchema: messageInput,
    run: async (input) => toolResult(await caller().email.message.get(input)),
  });

  registerTool(server, registry, {
    name: "list_email_drafts",
    description:
      "List the actor's unsent drafts. Scoped to a deal or a person when one is given, otherwise every draft in the mailbox.",
    inputSchema: recordScope,
    run: async (input) => {
      if (input.dealId !== undefined) {
        return toolResult(await caller().email.drafts.listForDeal({ dealId: input.dealId }));
      }
      if (input.personId !== undefined) {
        return toolResult(await caller().email.drafts.listForPerson({ personId: input.personId }));
      }
      return toolResult(await caller().email.drafts.list());
    },
  });
}
