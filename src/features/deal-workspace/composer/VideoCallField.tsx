"use client";
import { Video, X } from "lucide-react";
import type React from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

// Base for the generated video-call link. This is a plain token-based URL stored on the activity,
// NOT a Google Meet / Zoom OAuth integration (out of scope): we mint an opaque room token so the
// link is unique and shareable without any external provider.
const VIDEO_CALL_LINK_BASE = "https://meet.warpdrive.app/";

function generateVideoCallLink(): string {
  return `${VIDEO_CALL_LINK_BASE}${crypto.randomUUID()}`;
}

// Video-call link field (Pipedrive parity, B3). With no link yet, offers a generate action; once
// generated the link is shown with a remove control. The URL string is bound to the composer form
// and submitted with the activity.
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
