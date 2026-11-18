"use client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  TEAM_MAILBOX_BACKFILL_CHOICES,
  TEAM_MAILBOX_DEFAULT_BACKFILL,
} from "@/constants/teamMailbox";
import { readCsrfToken } from "@/utils/csrfCookie";
import { connectAgenticInbox, reconnectAgenticInbox } from "./agenticConnect";
import { agenticConnectMessage } from "./agenticConnectMessages";

export interface ReconnectTarget {
  accountId: string;
  address: string;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}): React.ReactNode {
  const id = useId();
  return (
    <label htmlFor={id} className="block space-y-1 text-sm">
      {label}
      <Input
        id={id}
        type={type}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function AgenticConnectDialog({
  open,
  onOpenChange,
  reconnectTarget,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reconnectTarget: ReconnectTarget | null;
}): React.ReactNode {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState("");
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [backfill, setBackfill] = useState(String(TEAM_MAILBOX_DEFAULT_BACKFILL));
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnecting = reconnectTarget !== null;
  function changeOpen(next: boolean): void {
    if (!next) setClientSecret("");
    onOpenChange(next);
  }
  async function submit(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = reconnecting
        ? await reconnectAgenticInbox(readCsrfToken(), {
            accountId: reconnectTarget.accountId,
            clientId,
            clientSecret,
          })
        : await connectAgenticInbox(readCsrfToken(), {
            baseUrl,
            address,
            displayName,
            clientId,
            clientSecret,
            backfillDays: Number(backfill),
          });
      if (!result.ok) {
        setError(agenticConnectMessage(result.error.id));
        return;
      }
      onOpenChange(false);
      router.refresh();
    } finally {
      setClientSecret("");
      setPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {reconnecting ? "Reconnect agentic inbox" : "Connect agentic inbox"}
          </DialogTitle>
          <DialogDescription>
            {reconnecting
              ? `Enter new service credentials for ${reconnectTarget.address}.`
              : "Connect a mailbox served by the Warpdrive fork of agentic inbox."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!reconnecting && (
            <>
              <Field label="Base URL" value={baseUrl} onChange={setBaseUrl} />
              <Field label="Mailbox address" value={address} onChange={setAddress} />
              <Field label="Display name" value={displayName} onChange={setDisplayName} />
              <Select
                ariaLabel="Import history"
                value={backfill}
                onChange={setBackfill}
                options={TEAM_MAILBOX_BACKFILL_CHOICES.map((value) => ({
                  value: String(value),
                  label: `${value} days`,
                }))}
              />
            </>
          )}
          <Field label="Client ID" value={clientId} onChange={setClientId} />
          <Field
            label="Client secret"
            type="password"
            value={clientSecret}
            onChange={setClientSecret}
          />
          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={() => void submit()}>
            {reconnecting ? "Reconnect" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
