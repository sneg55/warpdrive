import type { GmailPart } from "./gmailSchemas";

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  gmailAttachmentId: string;
}

export function extractAttachments(payload: GmailPart | undefined): ParsedAttachment[] {
  if (payload === undefined) return [];
  const out: ParsedAttachment[] = [];
  const walk = (part: GmailPart): void => {
    const filename = part.filename ?? "";
    const attachmentId = part.body?.attachmentId;
    if (filename !== "" && attachmentId !== undefined && attachmentId !== "") {
      out.push({
        filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        sizeBytes: part.body?.size ?? 0,
        gmailAttachmentId: attachmentId,
      });
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  return out;
}
