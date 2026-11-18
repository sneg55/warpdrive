"use client";

import { Paperclip } from "lucide-react";
import { useRef, useState } from "react";
import { Tip } from "@/components/ui/tooltip";
import { ALLOWED_CONTENT_TYPES } from "@/features/files/contentTypes";
import { confirmUploadAction, requestUploadAction } from "@/features/files/serverActions";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { AttachedFile } from "./AttachmentList";
import { ATTACH_MAX_FILE_BYTES } from "./composer.constants";

interface AttachButtonProps {
  entityType: "deal" | "person" | "organization" | "activity" | "email_message";
  entityId: string;
  onAttached: (file: AttachedFile) => void;
  onUploadingChange?: (uploading: boolean) => void;
}

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

    if (inputRef.current !== null) inputRef.current.value = "";
  }

  async function uploadSingleFile(file: File): Promise<string | null> {
    if (file.size > ATTACH_MAX_FILE_BYTES) {
      return `"${file.name}" is too large (max ${Math.round(ATTACH_MAX_FILE_BYTES / 1024 / 1024)} MB).`;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return `"${file.name}" has an unsupported file type.`;
    }

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

    const form = new FormData();
    for (const [k, v] of Object.entries(post.fields)) {
      form.append(k, v);
    }
    form.append("file", file);
    const uploadResp = await fetch(post.url, { method: "POST", body: form });
    if (!uploadResp.ok) {
      return `Upload failed for "${file.name}".`;
    }

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
      <Tip label="Attach file">
        <button
          type="button"
          aria-label="Attach file"
          onClick={() => inputRef.current?.click()}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
        >
          <Paperclip aria-hidden="true" className="h-4 w-4" />
        </button>
      </Tip>
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
