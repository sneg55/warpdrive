"use client";

// SaveAsTemplateDialog: saves the composer's current subject + body as a PRIVATE template.
// Sharing is managed later in Settings, so there is no share toggle here (isShared: false).
// A failed save surfaces through the app-wide ActionError modal, never a silent no-op.
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FIELD_INPUT } from "@/constants/formStyles";
import { createTemplateAction } from "@/features/email/authoringActions";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";

interface SaveAsTemplateDialogProps {
  subject: string;
  bodyHtml: string;
  // Controlled mode: when `open`/`onOpenChange` are supplied (e.g. opened from the template
  // dropdown footer), the default "Save as template" trigger button is omitted.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SaveAsTemplateDialog({
  subject,
  bodyHtml,
  open: openProp,
  onOpenChange,
}: SaveAsTemplateDialogProps): React.ReactNode {
  const reportError = useActionError();
  const utils = trpc.useUtils();
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  const setOpen = (next: boolean): void => {
    if (controlled) onOpenChange?.(next);
    else setOpenState(next);
  };
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  async function save(): Promise<void> {
    setSaving(true);
    const res = await createTemplateAction(readCsrfToken(), {
      name,
      subject,
      bodyHtml,
      isShared: false,
    });
    setSaving(false);
    if (res.ok) {
      setName("");
      setOpen(false);
      void utils.email.templates.list.invalidate();
      return;
    }
    reportError(res.error.id);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            Save as template
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
        </DialogHeader>
        <input
          aria-label="Template name"
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD_INPUT}
        />
        <DialogFooter>
          <Button type="button" disabled={!canSave} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
