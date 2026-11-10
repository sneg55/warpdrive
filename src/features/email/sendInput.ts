import { z } from "zod";
import { EMAIL_VISIBILITY } from "@/constants/email";

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
