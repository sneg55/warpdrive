import { z } from "zod";
import { EMAIL_VISIBILITY } from "@/constants/email";

export const archiveInput = z.object({ threadId: z.string().uuid() });

export const saveDraftInput = z.object({
  id: z.string().uuid().optional(),
  accountId: z.string().uuid(),
  threadId: z.string().uuid().nullable().optional(),
  subject: z.string().max(2000).default(""),
  // Drafts are in progress: bodyHtml is capped to bound autosave storage, and recipients are
  // arbitrary strings (a half-typed chip must not fail the save). The send path validates emails.
  bodyHtml: z.string().max(1_000_000).default(""),
  toEmails: z.array(z.string().max(320)).max(1000).default([]),
  ccEmails: z.array(z.string().max(320)).max(1000).default([]),
  // Compose privacy in progress, so a private selection survives resume (codex P1).
  visibility: z.enum(EMAIL_VISIBILITY).default("shared"),
});

export const deleteDraftInput = z.object({ draftId: z.string().uuid() });

export const cancelOutboxInput = z.object({ attemptId: z.string().uuid() });

export type SaveDraftInput = z.infer<typeof saveDraftInput>;
