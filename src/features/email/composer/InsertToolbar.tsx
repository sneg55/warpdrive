"use client";

// InsertToolbar: holds "Choose template" and "Insert field" controls.
// Choosing a template fetches its body via email.templates.get and calls
// onSubjectChange + onBodyChange so the parent Composer can set state.
// Choosing an insert field calls onInsertField with the resolved value so
// the parent can insert it at the editor cursor.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { MERGE_TOKEN_FIELDS, mergeTokenPlaceholder } from "@/features/email/mergeTokens";
import { trpc } from "@/lib/trpc-client";
import { InsertFieldMenu } from "./InsertFieldMenu";
import { type InsertFieldContext, insertFields } from "./insertFields";
import { SaveAsTemplateDialog } from "./SaveAsTemplateDialog";

// Inbox compose has no deal/person/org data to resolve values from, so it offers the same
// merge-token catalog TemplateDraftEditor.tsx uses: literal {{token}} placeholders that the
// send path resolves per-recipient (mergeContext.ts + applyMergeFields).
// Entity category from the token prefix (person./deal./org.), drives the Insert-field tabs.
const TOKEN_CATEGORY: Record<string, "Person" | "Deal" | "Organization"> = {
  person: "Person",
  deal: "Deal",
  org: "Organization",
};
const MERGE_TOKEN_ITEMS = MERGE_TOKEN_FIELDS.map((f) => ({
  label: f.label,
  value: mergeTokenPlaceholder(f.token),
  category: TOKEN_CATEGORY[f.token.split(".")[0] ?? ""],
}));

const CHOOSE_TEMPLATE_LABEL = "Choose template";

interface InsertToolbarProps {
  onSubjectChange: (subject: string) => void;
  onBodyChange: (bodyHtml: string) => void;
  // context is optional; kind="deal" resolves live values, anything else (inbox or
  // undefined) shows the merge-token catalog instead. Insert field menu always renders.
  context?: InsertFieldContext;
  // Called with the resolved field value when the user picks an insert field.
  onInsertField?: (value: string) => void;
  // Current subject/body, so "Save draft as a template" (in the template dropdown footer, PD
  // parity) can persist what is composed. Optional so predating callers keep working.
  subject?: string;
  bodyHtml?: string;
}

export function InsertToolbar({
  onSubjectChange,
  onBodyChange,
  context,
  onInsertField,
  subject = "",
  bodyHtml = "",
}: InsertToolbarProps): React.ReactNode {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  // Save-as-template dialog, opened from the template dropdown footer (PD parity).
  const [saveOpen, setSaveOpen] = useState(false);
  // Track the last template id we already applied upstream so a background
  // refetch does not re-fire onSubjectChange/onBodyChange for the same id
  // (item 3). Reset to "" whenever the user changes the selection.
  const appliedTemplateId = useRef("");

  const { data: templates = [] } = trpc.email.templates.list.useQuery();
  const { data: templateDetail } = trpc.email.templates.get.useQuery(
    { id: selectedTemplateId },
    { enabled: selectedTemplateId.length > 0 },
  );

  // Apply template: only when detail arrives for the currently-selected id AND
  // we haven't already applied this selection. Guards against background refetch
  // re-firing after a reset (item 3).
  useEffect(() => {
    if (templateDetail === undefined) return;
    if (selectedTemplateId === "") return;
    if (appliedTemplateId.current === selectedTemplateId) return;
    appliedTemplateId.current = selectedTemplateId;
    if (templateDetail.subject !== null) {
      onSubjectChange(templateDetail.subject);
    }
    onBodyChange(templateDetail.bodyHtml);
  }, [templateDetail, selectedTemplateId, onSubjectChange, onBodyChange]);

  // Deal context resolves live values (insertFields); inbox context (or no context at all,
  // as the /inbox/compose route renders it) has nothing to resolve, so it offers the literal
  // {{token}} merge-token catalog instead.
  const fields =
    context !== undefined && context.kind === "deal" ? insertFields(context) : MERGE_TOKEN_ITEMS;

  return (
    <div className="flex items-center gap-2 flex-wrap border-b border-border px-2 py-1">
      <div className="w-40">
        <Combobox
          ariaLabel={CHOOSE_TEMPLATE_LABEL}
          value={selectedTemplateId}
          onChange={(next) => {
            // Reset the applied-guard so the new selection triggers the effect.
            appliedTemplateId.current = "";
            setSelectedTemplateId(next);
          }}
          placeholder={CHOOSE_TEMPLATE_LABEL}
          options={templates.map<ComboboxOption>((t) => ({ value: t.id, label: t.name }))}
          // PD consolidates save + manage into the same dropdown as browse.
          footer={(close) => (
            <>
              <button
                type="button"
                onClick={() => {
                  close();
                  setSaveOpen(true);
                }}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-primary hover:bg-accent"
              >
                <span aria-hidden="true">+</span> Save draft as a template
              </button>
              <Link
                href="/settings/email"
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                Manage templates
              </Link>
            </>
          )}
        />
      </div>

      <InsertFieldMenu items={fields} onInsert={(v) => onInsertField?.(v)} />

      <SaveAsTemplateDialog
        subject={subject}
        bodyHtml={bodyHtml}
        open={saveOpen}
        onOpenChange={setSaveOpen}
      />
    </div>
  );
}
