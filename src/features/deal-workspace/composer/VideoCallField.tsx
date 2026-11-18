"use client";
import { Video, X } from "lucide-react";
import type React from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const VIDEO_CALL_LINK_BASE = "https://meet.warpdrive.app/";

function generateVideoCallLink(): string {
  return `${VIDEO_CALL_LINK_BASE}${crypto.randomUUID()}`;
}

export function VideoCallField({ value, onChange }: Props): React.ReactNode {
  if (value === "") {
    return (
      <button
        type="button"
        onClick={() => onChange(generateVideoCallLink())}
        className="inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground transition-transform hover:text-foreground active:scale-[0.96]"
      >
        <Video className="h-4 w-4" />
        Add video call link
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
      <a href={value} className="truncate text-primary hover:underline">
        {value}
      </a>
      <button
        type="button"
        aria-label="Remove video call link"
        onClick={() => onChange("")}
        className="rounded text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
