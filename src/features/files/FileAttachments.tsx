"use client";

import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ALLOWED_CONTENT_TYPES } from "./contentTypes";
import { FILE_ATTACHMENTS_STRINGS } from "./fileAttachments.constants";
import type { FileEntityType, FileListItem } from "./listFilesForEntity";
import { requestDownloadAction } from "./serverActions";
import { uploadOneFile } from "./uploadHandshake";

interface FileAttachmentsProps {
  entityType: FileEntityType;
  entityId: string;
  readOnly?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileAttachments({
  entityType,
  entityId,
  readOnly = false,
}: FileAttachmentsProps): React.ReactNode {
  const query = trpc.files.listForEntity.useQuery({ entityType, entityId });
  const files: FileListItem[] = query.data ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(list: FileList | null): Promise<void> {
    if (list === null || list.length === 0) return;
    setError(null);
    setBusy(true);
    let anyConfirmed = false;
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        if (file === undefined) continue;
        const message = await uploadOneFile(file, entityType, entityId);
        if (message !== null) {
          setError(message);
          return;
        }
        anyConfirmed = true;
      }
    } finally {
      setBusy(false);
      if (inputRef.current !== null) inputRef.current.value = "";
      if (anyConfirmed) void query.refetch();
    }
  }

  async function handleDownload(fileId: string): Promise<void> {
    setError(null);
    const result = await requestDownloadAction(readCsrfToken(), fileId);
    if (!result.ok) {
      setError(FILE_ATTACHMENTS_STRINGS.downloadFailed);
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = result.value.url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.click();
  }

  return (
    <div>
      {error !== null && (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{FILE_ATTACHMENTS_STRINGS.emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                onClick={() => void handleDownload(file.id)}
                aria-label={FILE_ATTACHMENTS_STRINGS.downloadLabel(file.filename)}
                className="truncate text-left text-primary hover:underline"
              >
                {file.filename}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatBytes(file.sizeBytes)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="mt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-md border px-3 py-1.5 text-sm transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50"
          >
            {FILE_ATTACHMENTS_STRINGS.uploadLabel}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label={FILE_ATTACHMENTS_STRINGS.uploadLabel}
            accept={ALLOWED_CONTENT_TYPES.join(",")}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      )}
    </div>
  );
}
