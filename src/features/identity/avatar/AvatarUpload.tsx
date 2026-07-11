"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { STRINGS } from "@/constants/strings";
import { readCsrfToken } from "@/utils/csrfCookie";
import {
  confirmAvatarUploadAction,
  removeAvatarAction,
  requestAvatarUploadAction,
} from "./avatarActions";
import { AVATAR_CONTENT_TYPES, AVATAR_MAX_BYTES, isAvatarContentType } from "./avatarStorage";

interface AvatarUploadProps {
  name: string;
  avatarUrl: string | null;
}

// Profile avatar control: shows the current avatar (or colored initials) and drives the
// presigned-upload handshake (request -> POST bytes -> confirm) with a client-side size/type
// guard mirroring the server. Kept small; the handshake logic is the same shape as AttachButton.
export function AvatarUpload({ name, avatarUrl }: AvatarUploadProps): React.ReactNode {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<string | null> {
    if (!isAvatarContentType(file.type)) return STRINGS.settings.photoInvalidType;
    if (file.size > AVATAR_MAX_BYTES) return STRINGS.settings.photoTooLarge;

    const csrf = readCsrfToken();
    const requested = await requestAvatarUploadAction(
      { contentType: file.type, size: file.size },
      csrf,
    );
    if (!requested.ok) return STRINGS.settings.photoFailed;

    const form = new FormData();
    for (const [k, v] of Object.entries(requested.value.post.fields)) form.append(k, v);
    form.append("file", file);
    const uploaded = await fetch(requested.value.post.url, { method: "POST", body: form });
    if (!uploaded.ok) return STRINGS.settings.photoFailed;

    const confirmed = await confirmAvatarUploadAction(csrf);
    if (!confirmed.ok) return STRINGS.settings.photoFailed;
    return null;
  }

  async function handleFiles(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (file === undefined) return;
    setError(null);
    setBusy(true);
    try {
      const message = await upload(file);
      if (message !== null) {
        setError(message);
        return;
      }
      router.refresh();
    } catch {
      setError(STRINGS.settings.photoFailed);
    } finally {
      setBusy(false);
      if (inputRef.current !== null) inputRef.current.value = "";
    }
  }

  async function remove(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const r = await removeAvatarAction(readCsrfToken());
      if (!r.ok) {
        setError(STRINGS.settings.photoFailed);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium">{STRINGS.settings.photo}</span>
      <div className="flex items-center gap-3">
        <Avatar name={name} src={avatarUrl} className="h-14 w-14 text-lg" />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded-md border px-3 py-1.5 text-sm font-medium transition-transform hover:bg-muted active:not-disabled:scale-[0.96] disabled:opacity-50"
            >
              {avatarUrl !== null ? STRINGS.settings.changePhoto : STRINGS.settings.uploadPhoto}
            </button>
            {avatarUrl !== null && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-transform hover:text-foreground active:not-disabled:scale-[0.96] disabled:opacity-50"
              >
                {STRINGS.settings.removePhoto}
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{STRINGS.settings.photoHint}</span>
        </div>
      </div>
      {error !== null && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept={AVATAR_CONTENT_TYPES.join(",")}
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
