import { Lock } from "lucide-react";
import { X_DM_STRINGS, X_INBOX_URL } from "../strings";

export function XEncryptedPanel(): React.ReactNode {
  return (
    <section
      aria-label={X_DM_STRINGS.encryptedHeading}
      className="rounded-lg border bg-muted/40 p-4 text-sm"
    >
      <h2 className="flex items-center gap-2 font-semibold text-foreground">
        <Lock aria-hidden="true" className="h-4 w-4" />
        {X_DM_STRINGS.encryptedHeading}
      </h2>
      <p className="mt-1 text-pretty text-foreground">{X_DM_STRINGS.encryptedBody}</p>
      <a
        href={X_INBOX_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center rounded-md border bg-card px-2.5 py-1.5 text-sm font-semibold hover:bg-accent"
      >
        {X_DM_STRINGS.openInX}
      </a>
    </section>
  );
}
