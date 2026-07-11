// AttachButton: paperclip button that drives the presigned-upload handshake for
// one or more files. On success calls onAttached with {fileId, filename, size}.
// Validates content-type and size client-side before calling the server action.

"use client";

import { useRef, useState } from "react";
import { ALLOWED_CONTENT_TYPES } from "@/features/files/contentTypes";
import { confirmUploadAction, requestUploadAction } from "@/features/files/serverActions";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { AttachedFile } from "./AttachmentList";
import { ATTACH_MAX_FILE_BYTES } from "./composer.constants";

interface AttachButtonProps {
  entityType: "deal" | "person" | "organization" | "activity" | "email_message";
  entityId: string;
  onAttached: (file: AttachedFile) => void;
  // Called with true when an upload batch starts, false when it finishes (success or error).
  // Lets the parent Composer disable Send while files are in flight.
  onUploadingChange?: (uploading: boolean) => void;
}

// Allowed MIME types as a plain Set for O(1) lookup.
const ALLOWED_TYPES = new Set<string>(ALLOWED_CONTENT_TYPES);

export function AttachButton({
  entityType,
  entityId,
  onAttached,
  onUploadingChange,
}: AttachButtonProps): React.ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null): Promise<void> {
    if (fileList === null || fileList.length === 0) return;
    setError(null);
    onUploadingChange?.(true);

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (file === undefined) continue;
        const uploadError = await uploadSingleFile(file);
        if (uploadError !== null) {
          setError(uploadError);
          return;
        }
      }
    } finally {
      onUploadingChange?.(false);
    }

    // Reset input so the same file can be re-selected after a remove.
    if (inputRef.current !== null) inputRef.current.value = "";
  }

  async function uploadSingleFile(file: File): Promise<string | null> {
    // Client-side guard: size and type before the server action.
    if (file.size > ATTACH_MAX_FILE_BYTES) {
      return `"${file.name}" is too large (max ${Math.round(ATTACH_MAX_FILE_BYTES / 1024 / 1024)} MB).`;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return `"${file.name}" has an unsupported file type.`;
    }

    // (1) Request a presigned POST from the server.
    const csrfToken = readCsrfToken();
    const requestResult = await requestUploadAction(csrfToken, {
      entityType,
      entityId,
      filename: file.name,
      contentType: file.type as (typeof ALLOWED_CONTENT_TYPES)[number],
      size: file.size,
    });
    if (!requestResult.ok) {
      return `Could not start upload for "${file.name}".`;
    }
    const { fileId, post } = requestResult.value;

    // (2) POST the file bytes directly to storage (presigned URL).
    const form = new FormData();
    for (const [k, v] of Object.entries(post.fields)) {
      form.append(k, v);
    }
    form.append("file", file);
    const uploadResp = await fetch(post.url, { method: "POST", body: form });
    if (!uploadResp.ok) {
      return `Upload failed for "${file.name}".`;
    }

    // (3) Confirm the upload server-side.
    const confirmResult = await confirmUploadAction(csrfToken, fileId);
    if (!confirmResult.ok) {
      return `Could not confirm upload for "${file.name}".`;
    }

    onAttached({ fileId, filename: file.name, size: file.size });
    return null;
  }

  return (
    <div>
      {error !== null && (
        <p role="alert" className="text-xs text-destructive mb-1">
          {error}
        </p>
      )}
      <button
        type="button"
        aria-label="Attach file"
        title="Attach file"
        onClick={() => inputRef.current?.click()}
        className="p-1 rounded hover:bg-accent text-muted-foreground"
      >
        {/* Paperclip icon */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept={ALLOWED_CONTENT_TYPES.join(",")}
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
