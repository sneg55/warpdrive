import { z } from "zod";
import { AGENTIC_MAX_RECIPIENTS, EMAIL_PROVIDER_KIND, EMAIL_VISIBILITY } from "@/constants/email";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import type { ProviderKind } from "./provider/types";

export const sendEmailInput = z.object({
  accountId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string(),
  bodyHtml: z.string(),
  threadId: z.string().optional(),
  inReplyToGmailMessageId: z.string().optional(),
  trackingEnabled: z.boolean().optional(),
  trackOpens: z.boolean().optional(),
  trackLinks: z.boolean().optional(),
  signatureId: z.string().uuid().optional(),
  attachments: z.array(z.object({ fileId: z.string().uuid() })).optional(),
  scheduledSendAt: z.date().optional(),
  linkPersonId: z.string().uuid().optional(),
  linkDealId: z.string().uuid().optional(),
  visibility: z.enum(EMAIL_VISIBILITY).optional(),
});

export type SendEmailInput = z.infer<typeof sendEmailInput>;

export function checkRecipientLimit(
  provider: ProviderKind,
  r: { to: string[]; cc?: string[]; bcc?: string[] },
): Result<void, AppError> {
  const count = r.to.length + (r.cc?.length ?? 0) + (r.bcc?.length ?? 0);
  if (provider !== EMAIL_PROVIDER_KIND.agenticInbox || count <= AGENTIC_MAX_RECIPIENTS) {
    return ok(undefined);
  }
  return err(
    new AppError(ERROR_IDS.AINBOX_TOO_MANY_RECIPIENTS, "too many recipients for this mailbox", {
      count,
      max: AGENTIC_MAX_RECIPIENTS,
    }),
  );
}
