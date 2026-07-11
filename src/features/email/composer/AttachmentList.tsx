// AttachmentList: shows confirmed uploads with a remove control per item.

export interface AttachedFile {
  fileId: string;
  filename: string;
  size: number;
}

interface AttachmentListProps {
  attachments: AttachedFile[];
  onRemove: (fileId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({ attachments, onRemove }: AttachmentListProps): React.ReactNode {
  if (attachments.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1 px-2 py-1">
      {attachments.map((f) => (
        <li key={f.fileId} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate flex-1">{f.filename}</span>
          <span className="shrink-0 text-muted-foreground/70">{formatBytes(f.size)}</span>
          <button
            type="button"
            aria-label={`Remove ${f.filename}`}
            onClick={() => onRemove(f.fileId)}
            className="shrink-0 hover:text-destructive"
          >
            &times;
          </button>
        </li>
      ))}
    </ul>
  );
}
