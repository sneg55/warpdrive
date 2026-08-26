"use client";
import type React from "react";
import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { QuotaRemaining } from "@/features/enrichment/providers/types";
import { SettingsCard, SettingsCardBody, SettingsCardHeader } from "../SettingsSurface";

const S = ENRICHMENT_STRINGS.settings;

export interface ProviderCardView {
  provider: string;
  name: string;
  enabled: boolean;
  hasKey: boolean;
  apiKeyHint: string | null;
  throttledUntilIso: string | null;
  throttleReason: string | null;
  needsAttention: boolean;
}

// Local wall-clock, because a cooldown is something the admin reads against their own clock.
function clockTime(iso: string): string {
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

// Zero is a real count and has to survive to the admin, so each window is tested for presence
// rather than truthiness.
function quotaLine(quota: QuotaRemaining | null): string | null {
  if (quota === null) return null;
  const windows: string[] = [];
  if (quota.hourly !== undefined) windows.push(S.testQuotaHourly(quota.hourly));
  if (quota.daily !== undefined) windows.push(S.testQuotaDaily(quota.daily));
  return windows.length === 0 ? null : S.testQuotaLine(windows.join(", "));
}

function notEntitledLine(entities: readonly string[] | null): string | null {
  if (entities === null || entities.length === 0) return null;
  const named = entities.map((e) =>
    e === "person" ? S.testLookupPerson : S.testLookupOrganization,
  );
  return S.testNotEntitledLine(named.join(S.testLookupSeparator));
}

// A null clock is the pre-mount render: both the comparison and the printed time are local, so
// neither may run until the browser has supplied its own clock.
function statusLine(view: ProviderCardView, now: Date | null): string {
  if (!view.hasKey) return S.statusNoKey;
  if (view.needsAttention) return S.statusRejected;
  if (now !== null && view.throttledUntilIso !== null && new Date(view.throttledUntilIso) > now) {
    const until = clockTime(view.throttledUntilIso);
    return view.throttleReason === "quota" ? S.statusQuota(until) : S.statusThrottled(until);
  }
  return view.enabled ? S.statusEnabled : S.statusDisabled;
}

export function ProviderCard({
  view,
  now,
  pending = false,
  onToggle,
  onSaveKey,
  onRemoveKey,
  onTest,
  testing = false,
  testResult = null,
  testQuota = null,
  testNotEntitled = null,
}: {
  view: ProviderCardView;
  now: Date | null;
  pending?: boolean;
  onToggle: (enabled: boolean) => void;
  onSaveKey: (apiKey: string) => void;
  onRemoveKey: () => void;
  onTest: () => void;
  testing?: boolean;
  testResult?: string | null;
  testQuota?: QuotaRemaining | null;
  testNotEntitled?: readonly string[] | null;
}): React.ReactNode {
  const keyFieldId = useId();
  const [draftKey, setDraftKey] = useState("");
  const [confirming, setConfirming] = useState(false);
  const allowance = quotaLine(testQuota);
  const planGap = notEntitledLine(testNotEntitled);
  // A probe reports on the key the row held when it started, so the key controls are locked for
  // its duration too, not only while a write is in flight.
  const locked = pending || testing;
  // A cooling provider is filtered out of the usable set, so a probe can only come back as a
  // missing key, which is not what happened.
  const resting =
    view.throttledUntilIso !== null && now !== null && new Date(view.throttledUntilIso) > now;

  function save(): void {
    const trimmed = draftKey.trim();
    if (trimmed === "") return;
    setDraftKey("");
    onSaveKey(trimmed);
  }

  return (
    <SettingsCard>
      <SettingsCardHeader
        title={view.name}
        description={statusLine(view, now)}
        actions={
          <div className="flex items-center gap-2">
            {!view.hasKey && (
              <span className="text-sm text-muted-foreground">{S.needsKeyFirst}</span>
            )}
            <Switch
              checked={view.enabled}
              onCheckedChange={onToggle}
              label={`${S.enabledLabel}: ${view.name}`}
              disabled={!view.hasKey || locked}
            />
          </div>
        }
      />
      <SettingsCardBody className="space-y-2">
        <label htmlFor={keyFieldId} className="block text-sm font-medium">
          {S.apiKeyLabel}
        </label>
        {/* Wraps rather than squeezes: the three action labels are fixed-width, so on a narrow
            window the buttons drop to their own line instead of crushing the key field. */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={keyFieldId}
            className="min-w-48 flex-1"
            type="password"
            autoComplete="off"
            value={draftKey}
            placeholder={S.apiKeyPlaceholder}
            onChange={(e) => setDraftKey(e.target.value)}
          />
          <Button size="sm" onClick={save} disabled={locked}>
            {pending ? S.saving : S.save}
          </Button>
          {view.hasKey && (
            <>
              <Button size="sm" variant="outline" onClick={onTest} disabled={locked || resting}>
                {testing ? S.testing : S.test}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirming(true)}
                disabled={locked}
              >
                {S.remove}
              </Button>
            </>
          )}
        </div>
        {view.hasKey && <p className="text-sm text-muted-foreground">{S.testCost}</p>}
        {testResult !== null && (
          <div className="space-y-2" aria-live="polite">
            <p className="text-sm">{testResult}</p>
            {allowance !== null && <p className="text-sm text-muted-foreground">{allowance}</p>}
            {planGap !== null && <p className="text-sm text-muted-foreground">{planGap}</p>}
          </div>
        )}
        {view.apiKeyHint !== null && (
          <p className="text-sm text-muted-foreground">{S.keyHint(view.apiKeyHint)}</p>
        )}
      </SettingsCardBody>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={S.removeConfirmTitle}
        description={S.removeConfirmBody}
        confirmLabel={S.removeConfirm}
        destructive={true}
        onConfirm={onRemoveKey}
      />
    </SettingsCard>
  );
}
