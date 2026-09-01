"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useId, useRef, useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Input } from "@/components/ui/Input";
import { MAX_DAILY_ACTIVITY_TARGET, MIN_DAILY_ACTIVITY_TARGET } from "@/constants/activityLoad";
import { STRINGS } from "@/constants/strings";
import { useInvalidateActivityLists } from "@/features/activities/useInvalidateActivityLists";
import { setDailyActivityTargetAction } from "@/features/identity/preferencesActions";
import { readCsrfToken } from "@/utils/csrfCookie";
import { SettingsCard, SettingsCardBody, SettingsCardHeader } from "../SettingsSurface";

const S = STRINGS.settings.dailyActivityTarget;

function parseTarget(draft: string): number | null {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value)) return null;
  if (value < MIN_DAILY_ACTIVITY_TARGET || value > MAX_DAILY_ACTIVITY_TARGET) return null;
  return value;
}

export function DailyActivityTarget({ target }: { target: number }): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const invalidateActivityLists = useInvalidateActivityLists();
  const fieldId = useId();
  const [draft, setDraft] = useState(String(target));
  const committedRef = useRef(target);
  const persistedRef = useRef(target);
  const revisionRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  function failWrite(revision: number, errorId?: string): void {
    const supersededByALaterCommit = revision !== revisionRef.current;
    if (supersededByALaterCommit) return;
    const persisted = persistedRef.current;
    committedRef.current = persisted;
    setDraft(String(persisted));
    reportError(errorId);
  }

  async function persist(next: number, revision: number): Promise<void> {
    try {
      const r = await setDailyActivityTargetAction({ target: next }, readCsrfToken());
      if (!r.ok) {
        failWrite(revision, r.error.id);
        return;
      }
    } catch {
      failWrite(revision);
      return;
    }
    persistedRef.current = next;
    void invalidateActivityLists();
    if (revision !== revisionRef.current) return;
    router.refresh();
  }

  function commit(): void {
    const current = committedRef.current;
    const next = parseTarget(draft);
    if (next === null || next === current) {
      setDraft(String(current));
      return;
    }
    const revision = ++revisionRef.current;
    committedRef.current = next;
    setDraft(String(next));
    writeQueueRef.current = writeQueueRef.current.then(() => persist(next, revision));
  }

  return (
    <SettingsCard>
      <SettingsCardHeader title={S.heading} description={S.description} />
      <SettingsCardBody>
        <label htmlFor={fieldId} className="mb-1 block text-sm font-medium">
          {S.label}
        </label>
        <Input
          id={fieldId}
          type="number"
          inputMode="numeric"
          min={MIN_DAILY_ACTIVITY_TARGET}
          max={MAX_DAILY_ACTIVITY_TARGET}
          step={1}
          className="w-24"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            commit();
          }}
        />
      </SettingsCardBody>
    </SettingsCard>
  );
}
