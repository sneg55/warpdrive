"use client";
import { UploadCloud } from "lucide-react";
import { type Dispatch, useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { STRINGS } from "@/constants/strings";
import { confirmImportUploadAction, requestImportUploadAction } from "@/features/import/actions";
import { MAX_IMPORT_CSV_BYTES } from "@/features/import/importFields";
import type { ImportTarget, WizardAction, WizardState } from "@/features/import/wizardState";
import { cn } from "@/lib/utils";
import { readCsrfToken } from "@/utils/csrfCookie";

const IMP = STRINGS.settings.importer;
const TARGETS: { value: ImportTarget; label: string }[] = [
  { value: "person", label: IMP.person },
  { value: "organization", label: IMP.organization },
  { value: "deal", label: IMP.deal },
  { value: "lead", label: IMP.lead },
  { value: "activity", label: IMP.activity },
];

export interface UploadStepProps {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  busy: boolean;
  onError: (id: string) => void;
}

export function UploadStep({ state, dispatch, busy, onError }: UploadStepProps): React.ReactNode {
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const disabled = busy || uploading;

  async function onFile(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    // Guard client-side before the network round-trip; the server re-enforces MAX_FILE_BYTES.
    if (file.size > MAX_IMPORT_CSV_BYTES) {
      setFileError(IMP.fileTooLarge);
      return;
    }
    setFileError(null);
    setUploading(true);
    try {
      const csrf = readCsrfToken();
      const req = await requestImportUploadAction(
        {
          targetEntity: state.target,
          filename: file.name,
          contentType: "text/csv",
          size: file.size,
        },
        csrf,
      );
      if (!req.ok) {
        onError(req.error.id);
        return;
      }
      const form = new FormData();
      for (const [k, v] of Object.entries(req.value.post.fields)) form.append(k, v);
      form.append("file", file);
      const put = await fetch(req.value.post.url, { method: "POST", body: form });
      if (!put.ok) {
        onError("E_IMPORT_UPLOAD");
        return;
      }
      const done = await confirmImportUploadAction(req.value.batchId, csrf);
      if (!done.ok) {
        onError(done.error.id);
        return;
      }
      dispatch({ type: "uploaded", batchId: req.value.batchId });
    } catch {
      onError("E_IMPORT_UPLOAD");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent): void {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    void onFile(e.dataTransfer.files[0]);
  }

  return (
    <section className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{IMP.entity}</legend>
        <RadioGroup
          value={state.target}
          onValueChange={(v) => dispatch({ type: "setTarget", target: v as ImportTarget })}
          aria-label={IMP.entity}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {TARGETS.map((t) => {
            const selected = state.target === t.value;
            return (
              <label
                key={t.value}
                htmlFor={`import-target-${t.value}`}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors",
                  selected
                    ? "border-primary bg-accent"
                    : "border-border bg-card hover:bg-accent/60",
                )}
              >
                <RadioGroupItem value={t.value} id={`import-target-${t.value}`} />
                <span className="font-medium">{t.label}</span>
              </label>
            );
          })}
        </RadioGroup>
      </fieldset>

      <div className="space-y-2">
        <span className="block text-sm font-medium">{IMP.chooseFile}</span>
        <label
          htmlFor="import-file-input"
          data-testid="import-dropzone"
          data-dragging={dragging}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            dragging ? "border-primary bg-accent" : "border-border bg-muted/40 hover:bg-accent/50",
          )}
        >
          <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">{IMP.dropzoneTitle}</span>
          <span className="text-xs text-muted-foreground">{IMP.dropzoneHint}</span>
          <input
            id="import-file-input"
            type="file"
            accept=".csv,text/csv"
            aria-label={IMP.chooseFile}
            disabled={disabled}
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
      </div>

      {uploading && <p className="text-sm text-muted-foreground">{IMP.importing}</p>}
      {fileError !== null && <p className="text-sm text-red-600">{fileError}</p>}
    </section>
  );
}
