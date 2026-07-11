// FromPicker: shows the sender address. Single-mailbox today, so it renders as plain text, no
// dropdown caret or button, to avoid implying a mailbox switcher that does not exist yet. When
// multi-mailbox lands in a later phase, restore an interactive control with an onChange handler.

interface FromPickerProps {
  address: string;
}

export function FromPicker({ address }: FromPickerProps): React.ReactNode {
  return (
    <div className="flex items-center gap-2 border-b border-border py-1.5">
      <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">From</span>
      <span className="text-xs text-foreground">{address}</span>
    </div>
  );
}
