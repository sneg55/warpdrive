"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { type RefObject, useId, useState } from "react";
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
import { STRINGS } from "@/constants/strings";
import { readCsrfToken } from "@/utils/csrfCookie";
import { createPipelineAction } from "./pipelineEditActions";

export type CreatePipelineDestination = "board" | "edit";

const ERROR_MESSAGE: Record<string, string> = {
  E_PERM_001: "You do not have permission to create pipelines.",
  E_AUTH_CSRF: "Your session expired. Reload the page and try again.",
};

interface CreatePipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: CreatePipelineDestination;
  returnFocusTo: RefObject<HTMLElement | null>;
}

export function CreatePipelineDialog(props: CreatePipelineDialogProps): React.ReactNode {
  const { open, onOpenChange, onCreated, returnFocusTo } = props;
  const router = useRouter();
  const nameId = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();

  async function submit(): Promise<void> {
    if (trimmed === "") return;
    setSaving(true);
    setError(null);
    try {
      const r = await createPipelineAction({ name: trimmed }, readCsrfToken());
      if (!r.ok) {
        setError(ERROR_MESSAGE[r.error.id] ?? r.error.id);
        return;
      }
      onOpenChange(false);
      const dest =
        onCreated === "board" ? `/pipeline/${r.value.id}` : `/pipeline/${r.value.id}/edit`;
      router.push(dest);
    } catch {
      setError(STRINGS.settings.createPipelineError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{STRINGS.settings.createPipeline}</DialogTitle>
          <DialogDescription>{STRINGS.settings.createPipelineDescription}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={nameId} className="mb-1 block text-sm font-medium">
            {STRINGS.settings.pipelineNameLabel}
          </label>
          <Input
            id={nameId}
            aria-label={STRINGS.settings.pipelineNameLabel}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={STRINGS.settings.pipelineNamePlaceholder}
            maxLength={255}
          />
          {error !== null && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 text-pretty"
            >
              {error}
            </p>
          )}
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={saving || trimmed === ""}>
              {saving ? STRINGS.settings.creating : STRINGS.settings.createPipeline}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
