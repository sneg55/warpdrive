"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Button } from "@/components/ui/Button";
import { STRINGS } from "@/constants/strings";
import { archiveDefAction } from "@/features/custom-fields/actions";
import { readCsrfToken } from "@/utils/csrfCookie";

const S = STRINGS.settings;

export function ArchiveFieldButton({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className: string;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function archive(): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      const r = await archiveDefAction({ id }, readCsrfToken());
      if (r.ok) router.refresh();
      else reportError(r.error.id);
    } catch {
      reportError();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(true)}
        className={className}
      >
        {pending ? S.archiving : S.archive}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={S.archiveFieldTitle(name)}
        description={S.archiveFieldBody}
        confirmLabel={S.archive}
        destructive
        pending={pending}
        onConfirm={() => void archive()}
      />
    </>
  );
}
