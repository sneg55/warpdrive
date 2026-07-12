"use client";

import { useState } from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { MAIL_FOLLOW_UP_STATUS } from "@/constants/email";
import { STRINGS } from "@/constants/strings";
import { readCsrfToken } from "@/utils/csrfCookie";
import { MailLabelPicker } from "./MailLabelPicker";
import { ThreadLabelChips } from "./ThreadLabelChips";
import { setFollowUpStatusAction, setThreadLabelsAction } from "./threadAttributesActions";

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

// Reader follow-up controls (B1): a status Select plus the mail-label catalog picker (U6). Applied
// labels render as chips; the picker adds/removes them (searchable, inline "+ Add label"). Both
// persist via owner-scoped server actions. Split out of ThreadPane to keep that file under the
// line-count target.
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

  async function handleLabelsChange(next: string[]): Promise<void> {
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
      <div className="flex flex-wrap items-center gap-1">
        <ThreadLabelChips labels={labels} />
        <MailLabelPicker value={labels} onChange={(next) => void handleLabelsChange(next)} />
      </div>
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
