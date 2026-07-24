"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useRef, useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Switch } from "@/components/ui/Switch";
import { STRINGS } from "@/constants/strings";
import type { InterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import {
  setOpenDetailsAfterCreateAction,
  setScheduleFollowUpAfterWonAction,
  setUiFlagAction,
} from "@/features/identity/preferencesActions";
import type { OpenDetailsAfterCreate, UiFlagKey } from "@/features/identity/preferencesSchema";
import { cn } from "@/lib/utils";
import { readCsrfToken } from "@/utils/csrfCookie";
import { SettingsCard, SettingsCardBody, SettingsCardHeader } from "../SettingsSurface";

const S = STRINGS.settings.interface;

// The five scalar flags, in Pipedrive's visual order. openDetailsAfterCreate is rendered separately
// because it is a parent switch over three per-entity children.
const FLAG_ROWS: Array<{ key: UiFlagKey; label: string }> = [
  { key: "usPhoneFormat", label: S.usPhoneFormat },
  { key: "winSound", label: S.winSound },
  { key: "emailLinksNewTab", label: S.emailLinksNewTab },
  { key: "prefillParticipantsAsRecipients", label: S.prefillParticipantsAsRecipients },
  { key: "autoPrefixLeadDealTitles", label: S.autoPrefixLeadDealTitles },
];

function Row({
  label,
  checked,
  onToggle,
  indent = false,
}: {
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  indent?: boolean;
}): React.ReactNode {
  return (
    <div className={cn("flex items-center justify-between gap-3", indent && "pl-6")}>
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onToggle} label={label} />
    </div>
  );
}

// Interface personal preferences (Pipedrive parity). Each toggle saves optimistically: flip the
// local state immediately, then persist; on failure revert and surface the error app-wide. No batch
// Save button, matching the schedule-follow-up toggle that already lives on this page.
export function InterfacePreferences({
  prefs,
  scheduleFollowUpAfterWon: initialScheduleFollowUp,
}: {
  prefs: InterfacePrefs;
  scheduleFollowUpAfterWon: boolean;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const [scheduleFollowUp, setScheduleFollowUp] = useState(initialScheduleFollowUp);
  const [flags, setFlags] = useState({
    usPhoneFormat: prefs.usPhoneFormat,
    winSound: prefs.winSound,
    emailLinksNewTab: prefs.emailLinksNewTab,
    prefillParticipantsAsRecipients: prefs.prefillParticipantsAsRecipients,
    autoPrefixLeadDealTitles: prefs.autoPrefixLeadDealTitles,
  });
  const [openDetails, setOpenDetails] = useState<OpenDetailsAfterCreate>(
    prefs.openDetailsAfterCreate,
  );
  const openDetailsRef = useRef(prefs.openDetailsAfterCreate);
  const persistedOpenDetailsRef = useRef(prefs.openDetailsAfterCreate);
  const openDetailsRevisionRef = useRef(0);
  const openDetailsWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  async function toggleFlag(key: UiFlagKey, next: boolean): Promise<void> {
    setFlags((f) => ({ ...f, [key]: next }));
    const r = await setUiFlagAction({ key, value: next }, readCsrfToken());
    if (!r.ok) {
      setFlags((f) => ({ ...f, [key]: !next }));
      reportError(r.error.id);
      return;
    }
    router.refresh();
  }

  // "Show add activity modal after winning a deal" (Pipedrive's first Interface toggle). Keeps its
  // own dedicated action because the deal page reads this flag directly, not through the client
  // provider.
  async function toggleScheduleFollowUp(next: boolean): Promise<void> {
    setScheduleFollowUp(next);
    const r = await setScheduleFollowUpAfterWonAction({ enabled: next }, readCsrfToken());
    if (!r.ok) {
      setScheduleFollowUp(!next);
      reportError(r.error.id);
      return;
    }
    router.refresh();
  }

  function failOpenDetailsWrite(revision: number, errorId?: string): void {
    // A later queued write contains the full cumulative object and can still persist this intent.
    if (revision !== openDetailsRevisionRef.current) return;
    const persisted = persistedOpenDetailsRef.current;
    openDetailsRef.current = persisted;
    setOpenDetails(persisted);
    reportError(errorId);
  }

  async function persistOpenDetails(next: OpenDetailsAfterCreate, revision: number): Promise<void> {
    try {
      const r = await setOpenDetailsAfterCreateAction(next, readCsrfToken());
      if (!r.ok) {
        failOpenDetailsWrite(revision, r.error.id);
        return;
      }
    } catch {
      failOpenDetailsWrite(revision);
      return;
    }
    persistedOpenDetailsRef.current = next;
    if (revision === openDetailsRevisionRef.current) router.refresh();
  }

  function writeOpenDetails(
    update: (current: OpenDetailsAfterCreate) => OpenDetailsAfterCreate,
  ): void {
    const next = update(openDetailsRef.current);
    const revision = ++openDetailsRevisionRef.current;
    openDetailsRef.current = next;
    setOpenDetails(next);
    openDetailsWriteQueueRef.current = openDetailsWriteQueueRef.current.then(() =>
      persistOpenDetails(next, revision),
    );
  }

  const allOpen = openDetails.leadDeal && openDetails.person && openDetails.org;

  return (
    <SettingsCard>
      <SettingsCardHeader
        title={STRINGS.settings.interfaceHeading}
        description="Choose how creation, navigation, formatting, and notifications behave."
      />
      <SettingsCardBody className="space-y-4">
        <Row
          label={STRINGS.settings.scheduleFollowUpAfterWon}
          checked={scheduleFollowUp}
          onToggle={(v) => void toggleScheduleFollowUp(v)}
        />
        <Row
          label={S.openDetailsAfterCreate}
          checked={allOpen}
          onToggle={(v) => writeOpenDetails(() => ({ leadDeal: v, person: v, org: v }))}
        />
        <div className="space-y-2">
          <Row
            indent
            label={S.openDetailsLeadDeal}
            checked={openDetails.leadDeal}
            onToggle={(v) => writeOpenDetails((current) => ({ ...current, leadDeal: v }))}
          />
          <Row
            indent
            label={S.openDetailsPerson}
            checked={openDetails.person}
            onToggle={(v) => writeOpenDetails((current) => ({ ...current, person: v }))}
          />
          <Row
            indent
            label={S.openDetailsOrg}
            checked={openDetails.org}
            onToggle={(v) => writeOpenDetails((current) => ({ ...current, org: v }))}
          />
        </div>
        {FLAG_ROWS.map((row) => (
          <Row
            key={row.key}
            label={row.label}
            checked={flags[row.key]}
            onToggle={(v) => void toggleFlag(row.key, v)}
          />
        ))}
      </SettingsCardBody>
    </SettingsCard>
  );
}
