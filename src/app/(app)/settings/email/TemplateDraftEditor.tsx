"use client";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { InsertFieldMenu } from "@/features/email/composer/InsertFieldMenu";
import { RichTextBody } from "@/features/email/composer/RichTextBodyLazy";
import { MERGE_TOKEN_FIELDS, mergeTokenPlaceholder } from "@/features/email/mergeTokens";
import { EMAIL_SETTINGS_STRINGS as S } from "./strings";

// A template draft. Shared with the client (the parent owns the value; the editor owns the
// insert-field cursor state so a bumped seq re-fires the {{token}} insertion in RichTextBody).
export type TemplateDraft = {
  id?: string;
  name: string;
  subject: string;
  bodyHtml: string;
  isShared: boolean;
};

// T1: the Insert-field menu offers literal {{token}} placeholders (resolved per-recipient at send).
const INSERT_ITEMS = MERGE_TOKEN_FIELDS.map((f) => ({
  label: f.label,
  value: mergeTokenPlaceholder(f.token),
}));

export function TemplateDraftEditor({
  draft,
  canShare,
  onChange,
  onSave,
  onCancel,
}: {
  draft: TemplateDraft;
  canShare: boolean;
  onChange: (next: TemplateDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}): React.ReactNode {
  // Bumping `seq` is what RichTextBody keys its cursor insertion on; `text` is the placeholder.
  const [insertToken, setInsertToken] = useState<{ text: string; seq: number }>({
    text: "",
    seq: 0,
  });

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Input
        aria-label={S.nameLabel}
        name="templateName"
        autoComplete="off"
        placeholder={`${S.nameLabel}…`}
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
      />
      <Input
        aria-label={S.subjectLabel}
        name="templateSubject"
        autoComplete="off"
        placeholder={`${S.subjectLabel}…`}
        value={draft.subject}
        onChange={(e) => onChange({ ...draft, subject: e.target.value })}
      />
      <div className="flex justify-end">
        <InsertFieldMenu
          items={INSERT_ITEMS}
          onInsert={(value) => setInsertToken((prev) => ({ text: value, seq: prev.seq + 1 }))}
        />
      </div>
      <RichTextBody
        html={draft.bodyHtml}
        onChange={(bodyHtml) => onChange({ ...draft, bodyHtml })}
        insertToken={insertToken}
      />
      {canShare && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={draft.isShared}
            onCheckedChange={(v) => onChange({ ...draft, isShared: v })}
            label={S.shareWithTeam}
          />
          {S.shareWithTeam}
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>
          {S.save}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          {S.cancel}
        </Button>
      </div>
    </div>
  );
}
