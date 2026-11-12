import { CircleCheck, Inbox, Sparkle, Sparkles } from "lucide-react";
import type React from "react";

export function InboxZeroIllustration(): React.ReactNode {
  return (
    <div aria-hidden="true" className="relative size-32">
      <div className="absolute inset-3 rounded-full bg-success/10" />
      <div className="absolute inset-7 rounded-full bg-success/15" />
      <Inbox
        className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.5}
      />
      <span className="absolute bottom-6 right-6 flex rounded-full bg-background">
        <CircleCheck className="size-8 fill-success text-success-foreground" strokeWidth={2} />
      </span>
      <Sparkles className="absolute left-1 top-3 size-6 text-primary" strokeWidth={1.75} />
      <Sparkle className="absolute right-2 top-1 size-4 text-primary/70" strokeWidth={2} />
      <Sparkle className="absolute bottom-3 left-5 size-3 text-primary/50" strokeWidth={2} />
    </div>
  );
}
