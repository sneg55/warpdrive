import { inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { emailMessageAttachments } from "@/db/schema";

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

// Attachment metadata for a set of messages, keyed by messageId. Bytes are never loaded
// here (lazy Gmail fetch happens on download, see attachmentDownload.ts). sizeBytes is a
// bigint column; going through Drizzle's query builder (mode: "number") auto-coerces it to
// a real number, unlike raw db.execute(sql\`...\`) which would hand back a string.
export async function attachmentsForMessages(
  db: Db,
  messageIds: string[],
  signal: AbortSignal,
): Promise<Map<string, AttachmentMeta[]>> {
  signal.throwIfAborted();
  const out = new Map<string, AttachmentMeta[]>();
  if (messageIds.length === 0) return out;

  const rows = await db
    .select({
      id: emailMessageAttachments.id,
      messageId: emailMessageAttachments.messageId,
      filename: emailMessageAttachments.filename,
      mimeType: emailMessageAttachments.mimeType,
      sizeBytes: emailMessageAttachments.sizeBytes,
    })
    .from(emailMessageAttachments)
    .where(inArray(emailMessageAttachments.messageId, messageIds));
  signal.throwIfAborted();

  for (const r of rows) {
    const list = out.get(r.messageId) ?? [];
    list.push({ id: r.id, filename: r.filename, mimeType: r.mimeType, sizeBytes: r.sizeBytes });
    out.set(r.messageId, list);
  }
  return out;
}
