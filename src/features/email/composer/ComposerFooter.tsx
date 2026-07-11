// ComposerFooter: right-aligned Send split (Send + Send later) and Discard.
// Phase 7: Send later is enabled when onSendLater is provided and a send is possible;
// clicking it opens a datetime-local picker (min = now). Choosing a strictly-future
// time calls onSendLater(Date); a past/now time shows an inline validation message.
// Left slot holds open-tracking, link-tracking toggles, and (deal only) add-as-activity.
// Right cluster includes the read-only VisibilityControl.

import { useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { STRINGS } from "@/constants/strings";
import { AddActivityToggle } from "./AddActivityToggle";
import { COMPOSER_STRINGS } from "./composer.constants";
import { SignatureDropdown } from "./SignatureDropdown";
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
  // Deal context only: show add-as-activity toggle.
  showAddAsActivity?: boolean;
  addAsActivity?: boolean;
  onAddAsActivityChange?: (v: boolean) => void;
  // Phase 7: when provided, enables the Send later button and handles scheduled send.
  onSendLater?: (scheduledAt: Date) => void;
  // Signature footer picker: when both are provided, render the signature dropdown.
  signatures?: { id: string; name: string }[];
  signatureId?: string;
  onSignatureChange?: (id: string) => void;
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
  signatures,
  signatureId,
  onSignatureChange,
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
      {/* Left slot: tracking toggles + add-as-activity (deal context only). */}
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
        {signatures !== undefined && signatures.length > 0 && onSignatureChange !== undefined && (
          <SignatureDropdown
            signatures={signatures}
            value={signatureId ?? ""}
            onChange={onSignatureChange}
          />
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Read-only visibility indicator (right cluster). */}
        <VisibilityControl label={COMPOSER_STRINGS.visibilityLabel} />

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
            <button
              type="button"
              disabled={sending || !canSend || onSendLater === undefined}
              title={onSendLater === undefined ? "Coming soon" : "Send later"}
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
                  className="ml-1 rounded-md bg-primary px-2 py-1 text-sm text-primary-foreground transition-transform hover:opacity-90 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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

        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground transition-[transform,background-color,color] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Discard"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
