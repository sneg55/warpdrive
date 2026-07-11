import type { AttachmentMeta } from "./attachmentReads";

// Same B/KB/MB convention as composer/AttachmentList.tsx and files/FileAttachments.tsx,
// kept as a small local pure function so this file has no cross-feature import.
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface InboundAttachmentListProps {
  attachments: AttachmentMeta[];
}

// Chips for inbound Gmail attachments: filename + humanized size, each linking to the
// lazy download route. Bytes are never held client-side; the route fetches from Gmail
// on click.
export function InboundAttachmentList({
  attachments,
}: InboundAttachmentListProps): React.ReactNode {
  if (attachments.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <li key={a.id}>
          <a
            href={`/api/email/attachments/${a.id}`}
            download
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent"
          >
            <span className="truncate max-w-[16rem]">{a.filename}</span>
            <span className="shrink-0 text-muted-foreground">{formatBytes(a.sizeBytes)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
