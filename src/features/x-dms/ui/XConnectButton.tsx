"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { readCsrfToken } from "@/utils/csrfCookie";
import { connectXAccountStart } from "../actions";

export function XConnectButton({ label }: { label: string }): React.ReactNode {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function connect(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await connectXAccountStart(readCsrfToken());
      if (result.ok) window.location.assign(result.value.url);
      else setError(result.error.id);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button disabled={pending} onClick={() => void connect()}>
        {label}
      </Button>
      {error !== null && <p role="alert">{error}</p>}
    </>
  );
}
