"use client";

import { useState } from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { MAIL_FOLLOW_UP_STATUS, MAIL_LABELS } from "@/constants/email";
import { STRINGS } from "@/constants/strings";
import { cn } from "@/lib/utils";
import { readCsrfToken } from "@/utils/csrfCookie";
import { setFollowUpStatusAction, setThreadLabelsAction } from "./threadAttributesActions";

type MailLabel = (typeof MAIL_LABELS)[number];

interface ThreadFollowUpControlsProps {
  threadId: string;
  // null = unset (never persisted as the literal "none"); the Select still needs a
  // concrete value, so it displays "none" without writing it until the user picks something.
  followUpStatus: string | null;
  labels: string[];
  // Called after either action succeeds, so the parent can refetch the thread.
  onChanged: () => void;
}

const STATUS_OPTIONS: SelectOption[] = MAIL_FOLLOW_UP_STATUS.map((s) => ({
  value: s,
  label: STRINGS.inbox.followUpStatusNames[s],
}));

const LABEL_VALUES = MAIL_LABELS;

// Reader follow-up controls (B1): a status Select plus toggleable label chips, both
// persisted via owner-scoped server actions. Split out of ThreadPane to keep that file
// under the line-count target.
export function ThreadFollowUpControls({
  threadId,
  followUpStatus,
  labels,
  onChanged,
}: ThreadFollowUpControlsProps): React.ReactNode {
  const [error, setError] = useState<string | null>(null);

  async function handleStatusChange(status: string): Promise<void> {
    const res = await setFollowUpStatusAction(readCsrfToken(), { threadId, status });
    if (!res.ok) {
      setError(STRINGS.inbox.errorSetFollowUpStatus);
      return;
    }
    setError(null);
    onChanged();
  }

  async function handleToggleLabel(label: MailLabel): Promise<void> {
    const next = labels.includes(label) ? labels.filter((l) => l !== label) : [...labels, label];
    const res = await setThreadLabelsAction(readCsrfToken(), { threadId, labels: next });
    if (!res.ok) {
      setError(STRINGS.inbox.errorSetLabels);
      return;
    }
    setError(null);
    onChanged();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-36">
        <Select
          ariaLabel={STRINGS.inbox.followUpStatusLabel}
          value={followUpStatus ?? "none"}
          onChange={(v) => void handleStatusChange(v)}
          options={STATUS_OPTIONS}
        />
      </div>
      <div className="flex gap-1">
        {LABEL_VALUES.map((label) => {
          const active = labels.includes(label);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => void handleToggleLabel(label)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs transition-transform active:scale-[0.96]",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {STRINGS.inbox.labelNames[label]}
            </button>
          );
        })}
      </div>
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
