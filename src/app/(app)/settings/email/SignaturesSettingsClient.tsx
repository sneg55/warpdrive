"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Checkbox } from "@/components/ui/Checkbox";
import { FIELD_INPUT } from "@/constants/formStyles";
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
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{S.signatures}</h2>
        <button
          type="button"
          className="rounded-md bg-action px-3 py-1.5 text-sm font-medium text-action-foreground transition-transform hover:opacity-90 active:scale-[0.96]"
          onClick={() => setDraft({ name: "", bodyHtml: "", isDefault: false })}
        >
          {S.newSignature}
        </button>
      </div>

      <ul className="divide-y rounded-md border">
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
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => void makeDefault(s.id)}
                  aria-label={`${S.setDefault} ${s.name}`}
                >
                  {S.setDefault}
                </button>
              )}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setDraft({ id: s.id, name: s.name, bodyHtml: s.bodyHtml, isDefault: s.isDefault })
                }
                aria-label={`${S.edit} ${s.name}`}
              >
                {S.edit}
              </button>
              <button
                type="button"
                className="text-destructive hover:opacity-80"
                onClick={() => void remove(s.id)}
                aria-label={`${S.delete} ${s.name}`}
              >
                {S.delete}
              </button>
            </span>
          </li>
        ))}
        {signatures.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">{S.empty}</li>
        )}
      </ul>

      {draft !== null && (
        <div className="space-y-2 rounded-md border p-3">
          <input
            aria-label={S.nameLabel}
            placeholder={S.nameLabel}
            value={draft.name}
            maxLength={40}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={FIELD_INPUT}
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
            <button
              type="button"
              className="rounded-md bg-action px-3 py-1.5 text-sm text-action-foreground transition-transform active:scale-[0.96]"
              onClick={() => void save()}
            >
              {S.save}
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-transform active:scale-[0.96]"
              onClick={() => setDraft(null)}
            >
              {S.cancel}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
