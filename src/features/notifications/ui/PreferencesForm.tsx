"use client";

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
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
      <span className="text-muted-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent",
          "transition-colors focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-ring focus-visible:ring-offset-2",
          checked ? "bg-primary" : "bg-input",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
            checked ? "translate-x-4" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </label>
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
