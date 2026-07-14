// ComposerFooter: right-aligned Discard then the Send split (Send + Send later), matching PD's
// action-bar order (Discard sits to the left of Send).
// Phase 7: Send later is enabled when onSendLater is provided and a send is possible;
// clicking it opens a datetime-local picker (min = now). Choosing a strictly-future
// time calls onSendLater(Date); a past/now time shows an inline validation message.
// Left slot holds open-tracking and link-tracking toggles plus add-as-activity (available
// from both deal and inbox context). The signature picker lives in the composer toolbar,
// not here, see Composer.tsx.
// Right cluster includes the read-only VisibilityControl.

import { useState } from "react";
import { Switch } from "@/components/ui/Switch";
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
  // Available from both deal and inbox context: show add-as-activity toggle.
  showAddAsActivity?: boolean;
  addAsActivity?: boolean;
  onAddAsActivityChange?: (v: boolean) => void;
  // Phase 7: when provided, enables the Send later button and handles scheduled send.
  onSendLater?: (scheduledAt: Date) => void;
  // C1: interactive compose privacy. Optional (defaults to shared) so existing render sites and
  // tests that predate the control keep working; Composer always supplies both.
  visibility?: EmailVisibility;
  onVisibilityChange?: (v: EmailVisibility) => void;
  // Hidden on a reply to an existing thread: the send path preserves that thread's visibility, so
  // the picker would be a no-op there (the reader's thread-privacy toggle governs instead). Defaults
  // to shown for a new compose (codex P2).
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

  // Current local time formatted for a datetime-local input (min attribute floor).
  function nowLocalInput(): string {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function handleSchedule(): void {
    if (!pickerValue) return;
    const d = new Date(pickerValue);
    // Validate: chosen time must be strictly in the future. Reject past/now with an
    // inline message (not the composer error banner).
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
      {/* Left slot: tracking toggles + add-as-activity (available from deal and inbox context). */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Switch checked={trackOpens} onCheckedChange={onTrackOpensChange} label="Track opens" />
          Opens
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Switch checked={trackLinks} onCheckedChange={onTrackLinksChange} label="Track links" />
          Links
        </span>
        {showAddAsActivity && onAddAsActivityChange !== undefined && (
          <AddActivityToggle checked={addAsActivity} onChange={onAddAsActivityChange} />
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Interactive privacy picker (right cluster): Private / Shared, threaded into the send. */}
        {showVisibility && (
          <VisibilityControl value={visibility} onChange={(v) => onVisibilityChange?.(v)} />
        )}

        {/* Discard sits to the LEFT of the Send split to match PD's action-bar order. */}
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
            {/* Send split: Send (green) + Send later (enabled when onSendLater provided). */}
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
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
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
