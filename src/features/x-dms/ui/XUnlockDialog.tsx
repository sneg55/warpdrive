"use client";
import { useId, useRef, useState } from "react";
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
import { ERROR_IDS } from "@/constants/errorIds";
import type { ClientError } from "@/types/actionResult";
import { readCsrfToken } from "@/utils/csrfCookie";
import { unlockChatKeysAction } from "../chatKeyActions";
import { X_DM_STRINGS } from "../strings";

function failureMessage(error: ClientError): string {
  if (error.id !== ERROR_IDS.X_PASSCODE_WRONG) return X_DM_STRINGS.errorId(error.id);
  if (error.guessesRemaining === undefined) return X_DM_STRINGS.wrongPasscodeNoCount;
  return error.guessesRemaining > 0
    ? X_DM_STRINGS.wrongPasscode(error.guessesRemaining)
    : X_DM_STRINGS.noAttemptsLeft;
}

function XUnlockForm({
  accountId,
  onOpenChange,
  onUnlocked,
  pending,
  setPending,
}: {
  accountId: string;
  onOpenChange: (open: boolean) => void;
  onUnlocked: () => void;
  pending: boolean;
  setPending: (pending: boolean) => void;
}): React.ReactNode {
  const fieldId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const input = field.current;
    if (pending || input === null || input.value === "") return;
    const passcode = input.value;
    input.value = "";
    setPending(true);
    setMessage(null);
    try {
      const result = await unlockChatKeysAction({ accountId, passcode }, readCsrfToken());
      if (!result.ok) {
        setMessage(failureMessage(result.error));
        return;
      }
      onOpenChange(false);
      onUnlocked();
    } catch {
      setMessage(X_DM_STRINGS.unlockFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{X_DM_STRINGS.unlockTitle}</DialogTitle>
        <DialogDescription>{X_DM_STRINGS.unlockNote}</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={fieldId} className="block space-y-1 text-sm">
          {X_DM_STRINGS.passcodeLabel}
          <Input
            id={fieldId}
            ref={field}
            type="password"
            autoComplete="off"
            maxLength={64}
            disabled={pending}
          />
        </label>
        {message !== null && (
          <p role="alert" className="text-sm">
            {message}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {X_DM_STRINGS.cancel}
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? X_DM_STRINGS.unlocking : X_DM_STRINGS.unlock}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function XUnlockDialog({
  accountId,
  open,
  onOpenChange,
  onUnlocked,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked: () => void;
}): React.ReactNode {
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <XUnlockForm
          accountId={accountId}
          onOpenChange={onOpenChange}
          onUnlocked={onUnlocked}
          pending={pending}
          setPending={setPending}
        />
      </DialogContent>
    </Dialog>
  );
}
