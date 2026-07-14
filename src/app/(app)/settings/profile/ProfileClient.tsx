"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Button } from "@/components/ui/Button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { Select, type SelectOption } from "@/components/ui/Select";
import { STRINGS } from "@/constants/strings";
import { AvatarUpload } from "@/features/identity/avatar/AvatarUpload";
import { updateProfilePreferencesAction } from "@/features/identity/preferencesActions";
import { updateUserProfileAction } from "@/features/identity/profileActions";
import { readCsrfToken } from "@/utils/csrfCookie";

interface ProfileClientProps {
  name: string;
  email: string;
  avatarUrl: string | null;
  timezone: string | null;
  density: "comfortable" | "compact";
}

// A small IANA subset for the dropdown; the value is stored verbatim. Full list is unnecessary.
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Kyiv",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];
const TIMEZONE_NONE_VALUE = "timezone:none";
const TIMEZONE_OPTIONS: SelectOption[] = [
  { value: TIMEZONE_NONE_VALUE, label: STRINGS.settings.timezoneNone },
  ...TIMEZONES.map((tz) => ({ value: tz, label: tz })),
];

export function ProfileClient(props: ProfileClientProps): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const [timezone, setTimezone] = useState<string>(props.timezone ?? "");
  const [density, setDensity] = useState(props.density);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const [draftName, setDraftName] = useState(props.name);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setPending(true);
    setSaved(false);
    const r = await updateProfilePreferencesAction(
      { timezone: timezone === "" ? null : timezone, density },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      setSaved(true);
      router.refresh();
    } else reportError(r.error.id);
  }

  async function saveName(): Promise<void> {
    setNameSaving(true);
    setNameSaved(false);
    setNameError(null);
    const r = await updateUserProfileAction({ name: draftName.trim() }, readCsrfToken());
    setNameSaving(false);
    if (r.ok) {
      setNameSaved(true);
      router.refresh();
    } else {
      setNameError(r.error.id);
    }
  }

  return (
    <div className="space-y-4">
      <AvatarUpload name={props.name} avatarUrl={props.avatarUrl} />
      <div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{STRINGS.settings.name}</span>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="w-full rounded-md border px-2.5 py-1.5 text-sm"
          />
        </label>
        {nameError !== null && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {`Could not save name (${nameError})`}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            disabled={nameSaving}
            onClick={() => void saveName()}
            className="rounded-md border px-3 py-1.5 text-sm font-medium transition-transform hover:bg-muted active:not-disabled:scale-[0.96] disabled:opacity-50"
          >
            {STRINGS.settings.saveName}
          </button>
          {nameSaved && (
            <span className="text-sm text-muted-foreground">{STRINGS.settings.saved}</span>
          )}
        </div>
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium">{STRINGS.settings.email}</span>
        <p className="text-sm text-muted-foreground">{props.email || "-"}</p>
      </div>

      <div className="block">
        <span className="mb-1 block text-sm font-medium">{STRINGS.settings.timezone}</span>
        <Select
          ariaLabel={STRINGS.settings.timezone}
          value={timezone}
          onChange={(value) => setTimezone(value === TIMEZONE_NONE_VALUE ? "" : value)}
          placeholder={STRINGS.settings.timezoneNone}
          options={TIMEZONE_OPTIONS}
        />
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium">{STRINGS.settings.density}</legend>
        <RadioGroup
          value={density}
          onValueChange={(v) => setDensity(v as "comfortable" | "compact")}
          aria-label={STRINGS.settings.density}
          className="flex gap-4 text-sm"
        >
          {(["comfortable", "compact"] as const).map((d) => (
            <div key={d} className="flex items-center gap-1.5">
              <RadioGroupItem value={d} id={`density-${d}`} />
              <label htmlFor={`density-${d}`} className="cursor-pointer">
                {d === "comfortable" ? STRINGS.settings.comfortable : STRINGS.settings.compact}
              </label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="default"
          size="sm"
          className="px-3"
          disabled={pending}
          onClick={() => void save()}
        >
          {STRINGS.settings.save}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">{STRINGS.settings.saved}</span>}
      </div>
    </div>
  );
}
