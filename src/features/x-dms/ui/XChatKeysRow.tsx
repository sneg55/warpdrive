"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { XAccountSettings } from "../accountAdmin";
import { removeChatKeysAction } from "../chatKeyActions";
import { X_DM_STRINGS } from "../strings";
import { XUnlockDialog } from "./XUnlockDialog";

function keysLine(account: XAccountSettings): string {
  if (account.chatKeyState === "locked") return X_DM_STRINGS.keysLocked;
  if (account.chatKeyState === "stale") return X_DM_STRINGS.keysStale;
  const date = account.chatKeysUnlockedAt?.toLocaleDateString() ?? "";
  return X_DM_STRINGS.keysUnlocked(account.chatKeysUnlockedByName, date);
}

export function XChatKeysRow({ account }: { account: XAccountSettings }): React.ReactNode {
  const router = useRouter();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await removeChatKeysAction({ accountId: account.id }, readCsrfToken());
      if (!result.ok) setError(X_DM_STRINGS.errorId(result.error.id));
      else router.refresh();
    } catch {
      setError(X_DM_STRINGS.removeKeysFailed);
    } finally {
      setPending(false);
      setConfirm(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm">{keysLine(account)}</p>
      {account.chatKeyState !== "unlocked" && (
        <Button variant="outline" size="sm" onClick={() => setUnlockOpen(true)}>
          {account.chatKeyState === "stale" ? X_DM_STRINGS.unlockAgain : X_DM_STRINGS.unlock}
        </Button>
      )}
      {account.chatKeyState !== "locked" && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirm(true)}>
          {X_DM_STRINGS.removeKeys}
        </Button>
      )}
      {error !== null && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <XUnlockDialog
        accountId={account.id}
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        onUnlocked={() => router.refresh()}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={X_DM_STRINGS.removeKeysTitle}
        description={X_DM_STRINGS.removeKeysBody}
        confirmLabel={X_DM_STRINGS.removeKeys}
        destructive
        onConfirm={() => void remove()}
        pending={pending}
      />
    </div>
  );
}
