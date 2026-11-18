import { z } from "zod";
import { EMAIL_VISIBILITY } from "@/constants/email";

export const archiveInput = z.object({ threadId: z.string().uuid() });

export const saveDraftInput = z.object({
  id: z.string().uuid().optional(),
  accountId: z.string().uuid(),
  threadId: z.string().uuid().nullable().optional(),
  subject: z.string().max(2000).default(""),
  bodyHtml: z.string().max(1_000_000).default(""),
  toEmails: z.array(z.string().max(320)).max(1000).default([]),
  ccEmails: z.array(z.string().max(320)).max(1000).default([]),
  visibility: z.enum(EMAIL_VISIBILITY).default("shared"),
  linkDealId: z.string().uuid().nullable().optional(),
  linkPersonId: z.string().uuid().nullable().optional(),
});

export const deleteDraftInput = z.object({ draftId: z.string().uuid() });

export const cancelOutboxInput = z.object({ attemptId: z.string().uuid() });
