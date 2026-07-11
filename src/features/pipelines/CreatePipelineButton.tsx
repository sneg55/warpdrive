"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { STRINGS } from "@/constants/strings";
import { readCsrfToken } from "@/utils/csrfCookie";
import { createPipelineAction } from "./pipelineEditActions";

// Where to send the user after a pipeline is created: "board" lands on the new (empty) board,
// "edit" opens the stage editor. Empty-state CTA uses "board"; the settings list uses "edit".
type OnCreated = "board" | "edit";

const ERROR_MESSAGE: Record<string, string> = {
  E_PERM_001: "You do not have permission to create pipelines.",
  E_AUTH_CSRF: "Your session expired. Reload the page and try again.",
};

interface CreatePipelineButtonProps {
  label: string;
  onCreated?: OnCreated;
  variant?: "default" | "outline" | "ghost";
}

export function CreatePipelineButton({
  label,
  onCreated = "edit",
  variant = "default",
}: CreatePipelineButtonProps): React.ReactNode {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      // push() navigates to a fresh route and fetches its RSC payload; do NOT chain refresh()
      // here. refresh() re-targets the CURRENT route and cancels the pending push, stranding the
      // user on the page they started from (observed: create from settings stayed on the list).
      const dest =
        onCreated === "board" ? `/pipeline/${r.value.id}` : `/pipeline/${r.value.id}/edit`;
      router.push(dest);
    } catch {
      // A thrown/rejected action (validation ZodError, network drop) must still surface: without
      // this the dialog would sit open with no feedback and the submit button re-enabled.
      setError(STRINGS.settings.createPipelineError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>{label}</Button>
      </DialogTrigger>
      <DialogContent>
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
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{STRINGS.settings.pipelineNameLabel}</span>
            <input
              aria-label={STRINGS.settings.pipelineNameLabel}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={STRINGS.settings.pipelineNamePlaceholder}
              maxLength={255}
              className="w-full rounded-md border px-2.5 py-1.5 text-sm"
            />
          </label>
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
