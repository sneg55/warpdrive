import { Select } from "@/components/ui/Select";

interface FromPickerProps {
  address: string;
  accountId?: string;
  mailboxes?: { id: string; emailAddress: string; displayName: string }[];
  onChange?: (accountId: string) => void;
}

export function FromPicker({
  address,
  accountId,
  mailboxes,
  onChange,
}: FromPickerProps): React.ReactNode {
  return (
    <>
      <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">From</span>
      {mailboxes !== undefined &&
      mailboxes.length > 1 &&
      accountId !== undefined &&
      onChange !== undefined ? (
        <Select
          ariaLabel="From mailbox"
          value={accountId}
          onChange={onChange}
          options={mailboxes.map((mailbox) => ({
            value: mailbox.id,
            label: `${mailbox.displayName} <${mailbox.emailAddress}>`,
          }))}
        />
      ) : (
        <span className="text-xs text-foreground">{address}</span>
      )}
    </>
  );
}
