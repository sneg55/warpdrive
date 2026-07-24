"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import {
  createSignatureAction,
  deleteSignatureAction,
  setDefaultSignatureAction,
  updateSignatureAction,
} from "@/features/email/authoringActions";
import { RichTextBody } from "@/features/email/composer/RichTextBodyLazy";
import { readCsrfToken } from "@/utils/csrfCookie";
import { EMAIL_SETTINGS_STRINGS as S } from "./strings";

type Sig = { id: string; name: string; isDefault: boolean; bodyHtml: string };
type Draft = { id?: string; name: string; bodyHtml: string; isDefault: boolean };
const ROW_BUTTON =
  "relative h-auto px-0 py-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground after:absolute after:left-0 after:top-1/2 after:h-10 after:w-full after:-translate-y-1/2 after:content-['']";

export function SignaturesSettingsClient({ signatures }: { signatures: Sig[] }): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const [draft, setDraft] = useState<Draft | null>(null);
  const csrf = (): string | null => readCsrfToken();

  async function save(): Promise<void> {
    if (draft === null || draft.name.trim() === "") return;
    const payload = { name: draft.name, bodyHtml: draft.bodyHtml, isDefault: draft.isDefault };
    const r =
      draft.id === undefined
        ? await createSignatureAction(csrf(), payload)
        : await updateSignatureAction(csrf(), { id: draft.id, patch: payload });
    if (r.ok) {
      setDraft(null);
      router.refresh();
    } else reportError(r.error.id);
  }
  async function remove(id: string): Promise<void> {
    const r = await deleteSignatureAction(csrf(), { id });
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }
  async function makeDefault(id: string): Promise<void> {
    const r = await setDefaultSignatureAction(csrf(), { signatureId: id });
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-sm font-semibold">{S.signatures}</h2>
        <Button size="sm" onClick={() => setDraft({ name: "", bodyHtml: "", isDefault: false })}>
          {S.newSignature}
        </Button>
      </div>

      <div className="space-y-3 p-5">
        <ul className="divide-y overflow-hidden rounded-md border">
          {signatures.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                {s.name}
                {s.isDefault && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
                    {S.defaultBadge}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                {!s.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={ROW_BUTTON}
                    onClick={() => void makeDefault(s.id)}
                    aria-label={`${S.setDefault} ${s.name}`}
                  >
                    {S.setDefault}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className={ROW_BUTTON}
                  onClick={() =>
                    setDraft({
                      id: s.id,
                      name: s.name,
                      bodyHtml: s.bodyHtml,
                      isDefault: s.isDefault,
                    })
                  }
                  aria-label={`${S.edit} ${s.name}`}
                >
                  {S.edit}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`${ROW_BUTTON} text-destructive hover:text-destructive/80`}
                  onClick={() => void remove(s.id)}
                  aria-label={`${S.delete} ${s.name}`}
                >
                  {S.delete}
                </Button>
              </span>
            </li>
          ))}
          {signatures.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">{S.empty}</li>
          )}
        </ul>

        {draft !== null && (
          <div className="space-y-2 rounded-md border p-3">
            <Input
              aria-label={S.nameLabel}
              name="signatureName"
              autoComplete="off"
              placeholder={`${S.nameLabel}…`}
              value={draft.name}
              maxLength={40}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{S.maxNameHint}</p>
            <RichTextBody
              html={draft.bodyHtml}
              onChange={(bodyHtml) => setDraft({ ...draft, bodyHtml })}
            />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={draft.isDefault}
                onCheckedChange={(v) => setDraft({ ...draft, isDefault: v })}
                label={S.setDefault}
              />
              {S.setDefault}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void save()}>
                {S.save}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                {S.cancel}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
