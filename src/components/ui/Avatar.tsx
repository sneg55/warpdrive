import type React from "react";
import { avatarColorClass, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  // Optional avatar image (e.g. users.avatar_url). Renders the image when present, falling back to
  // colored initials when null/undefined or if it fails to load is not handled (kept simple).
  src?: string | null;
  className?: string;
}

// Colored initial avatar (Pipedrive shows one beside every contact/owner). The
// name drives both the initials and a deterministic swatch. role="img" with an
// aria-label keeps the initials from being read as loose text.
export function Avatar({ name, src, className }: AvatarProps): React.ReactNode {
  if (src !== null && src !== undefined && src !== "") {
    return (
      // biome-ignore lint/performance/noImgElement: small avatar, next/image not warranted here
      <img
        src={src}
        alt={name}
        className={cn(
          "inline-block h-7 w-7 shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
          className,
        )}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        avatarColorClass(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
