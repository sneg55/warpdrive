"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/Switch";
import type { NotificationType } from "@/constants/notificationTypes";
import { NOTIFICATION_TYPES } from "@/constants/notificationTypes";
import { STRINGS } from "@/constants/strings";

type Prefs = Record<NotificationType, { inApp: boolean; email: boolean }>;

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

function Toggle({ label, checked, onChange }: ToggleProps) {
  const id = useId();
  return (
    <span className="flex items-center gap-2 text-sm select-none">
      <label htmlFor={id} className="cursor-pointer text-muted-foreground">
        {label}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} label={label} />
    </span>
  );
}

export function PreferencesForm({
  prefs,
  onChange,
}: {
  prefs: Prefs;
  onChange: (type: NotificationType, next: { inApp: boolean; email: boolean }) => void;
}) {
  const { columnInApp, columnEmail, typeLabels } = STRINGS.notifications.preferences;

  return (
    <div className="divide-y">
      {NOTIFICATION_TYPES.map((type) => (
        <div key={type} data-testid="pref-row" className="flex items-center justify-between py-3">
          <span className="text-sm font-medium">{typeLabels[type]}</span>
          <div className="flex items-center gap-6">
            <Toggle
              label={columnInApp}
              checked={prefs[type].inApp}
              onChange={(next) => onChange(type, { ...prefs[type], inApp: next })}
            />
            <Toggle
              label={columnEmail}
              checked={prefs[type].email}
              onChange={(next) => onChange(type, { ...prefs[type], email: next })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
