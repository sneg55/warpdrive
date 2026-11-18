import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { ToggleField } from "@/components/ui/ToggleField";
import { Tip } from "@/components/ui/tooltip";
import { STRINGS } from "@/constants/strings";
import type { EmailVisibility } from "../threadVisibility";
import { AddActivityToggle } from "./AddActivityToggle";
import { COMPOSER_STRINGS } from "./composer.constants";
import { VisibilityControl } from "./VisibilityControl";

interface ComposerFooterProps {
  canSend: boolean;
  sending: boolean;
  onSend: () => void;
  onDiscard: () => void;
  trackOpens: boolean;
  onTrackOpensChange: (v: boolean) => void;
  trackLinks: boolean;
  onTrackLinksChange: (v: boolean) => void;
  showAddAsActivity?: boolean;
  addAsActivity?: boolean;
  onAddAsActivityChange?: (v: boolean) => void;
  onSendLater?: (scheduledAt: Date) => void;
  visibility?: EmailVisibility;
  onVisibilityChange?: (v: EmailVisibility) => void;
  showVisibility?: boolean;
}

export function ComposerFooter({
  canSend,
  sending,
  onSend,
  onDiscard,
  trackOpens,
  onTrackOpensChange,
  trackLinks,
  onTrackLinksChange,
  showAddAsActivity = false,
  addAsActivity = false,
  onAddAsActivityChange,
  onSendLater,
  visibility = "shared",
  onVisibilityChange,
  showVisibility = true,
}: ComposerFooterProps): React.ReactNode {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerValue, setPickerValue] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);

  function nowLocalInput(): string {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function handleSchedule(): void {
    if (!pickerValue) return;
    const d = new Date(pickerValue);
    if (d.getTime() <= Date.now()) {
      setPickerError(COMPOSER_STRINGS.scheduledPastMessage);
      return;
    }
    setPickerError(null);
    setShowPicker(false);
    setPickerValue("");
    onSendLater?.(d);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <ToggleField
          control="switch"
          label="Opens"
          accessibleLabel="Track opens"
          checked={trackOpens}
          onCheckedChange={onTrackOpensChange}
        />
        <ToggleField
          control="switch"
          label="Links"
          accessibleLabel="Track links"
          checked={trackLinks}
          onCheckedChange={onTrackLinksChange}
        />
        {showAddAsActivity && onAddAsActivityChange !== undefined && (
          <AddActivityToggle checked={addAsActivity} onChange={onAddAsActivityChange} />
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {showVisibility && (
          <VisibilityControl value={visibility} onChange={(v) => onVisibilityChange?.(v)} />
        )}

        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground transition-[transform,background-color,color] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Discard"
        >
          Discard
        </button>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onSend}
              disabled={sending || !canSend}
              className="px-3 py-1.5 rounded-l-md bg-success text-success-foreground text-sm font-medium transition-[transform,opacity] hover:opacity-90 active:scale-[0.96] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              {STRINGS.inbox.send}
            </button>
            <Tip label={onSendLater === undefined ? "Coming soon" : "Send later"}>
              <button
                type="button"
                disabled={sending || !canSend || onSendLater === undefined}
                aria-label="Send later"
                onClick={() => {
                  if (onSendLater !== undefined) setShowPicker((p) => !p);
                }}
                className="px-2 py-1.5 rounded-r-md border-l border-success-foreground/20 bg-success text-success-foreground text-sm font-medium transition-[transform,opacity] hover:opacity-90 active:scale-[0.96] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </Tip>
          </div>
          {showPicker && (
            <div className="flex flex-col items-end gap-1 mt-1">
              <div className="flex items-center gap-1">
                <input
                  type="datetime-local"
                  data-testid="scheduled-at-picker"
                  min={nowLocalInput()}
                  value={pickerValue}
                  onChange={(e) => {
                    setPickerValue(e.target.value);
                    setPickerError(null);
                  }}
                  className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={handleSchedule}
                  className="ml-1 rounded-md bg-action px-2 py-1 text-sm text-action-foreground transition-transform hover:opacity-90 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  Schedule
                </button>
              </div>
              {pickerError !== null && (
                <span className="text-xs text-destructive">{pickerError}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
