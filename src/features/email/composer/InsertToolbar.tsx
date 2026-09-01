"use client";

// InsertToolbar: holds "Choose template" and "Insert field" controls.
// Choosing a template fetches its body via email.templates.get and calls
// onSubjectChange + onBodyChange so the parent Composer can set state.
// Choosing an insert field calls onInsertField with the resolved value so
// the parent can insert it at the editor cursor.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { applyMergeFields } from "@/features/email/merge";
import { MERGE_TOKEN_FIELDS, mergeTokenPlaceholder } from "@/features/email/mergeTokens";
import { trpc } from "@/lib/trpc-client";
import { InsertFieldMenu } from "./InsertFieldMenu";
import { type InsertFieldContext, insertFields } from "./insertFields";
import { SaveAsTemplateDialog } from "./SaveAsTemplateDialog";
import { type AppliedTemplate, shouldApplyTemplate } from "./templateApply";

// Entity category from the token prefix (person./deal./org.), drives the Insert-field tabs.
const TOKEN_CATEGORY: Record<string, "Person" | "Deal" | "Organization"> = {
  person: "Person",
  deal: "Deal",
  org: "Organization",
};

// Insert-field entries outside a deal context. A field the recipient resolves inserts its value,
// so what the author sees is what the recipient reads; one with nothing to resolve falls back to
// the literal {{token}}, which the send path resolves per-recipient.
function mergeTokenItems(ctx: Record<string, string>): {
  label: string;
  value: string;
  category?: "Person" | "Deal" | "Organization";
}[] {
  return MERGE_TOKEN_FIELDS.map((f) => ({
    label: f.label,
    value: ctx[f.token] ?? mergeTokenPlaceholder(f.token),
    category: TOKEN_CATEGORY[f.token.split(".")[0] ?? ""],
  }));
}

const CHOOSE_TEMPLATE_LABEL = "Choose template";
// Stable identity so the apply effect does not re-run on every render while the query is loading.
const EMPTY_MERGE_CONTEXT: Record<string, string> = {};

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
  // Compose context for merge-field resolution: an applied template comes back with
  // {{tokens}} already replaced by this recipient's values (see getTemplateForCompose).
  recipientEmail?: string;
  personId?: string | null;
  dealId?: string | null;
}

export function InsertToolbar({
  onSubjectChange,
  onBodyChange,
  context,
  onInsertField,
  subject = "",
  bodyHtml = "",
  recipientEmail = "",
  personId = null,
  dealId = null,
}: InsertToolbarProps): React.ReactNode {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  // Save-as-template dialog, opened from the template dropdown footer (PD parity).
  const [saveOpen, setSaveOpen] = useState(false);
  // Track the last template id we already applied upstream so a background
  // refetch does not re-fire onSubjectChange/onBodyChange for the same id
  // (item 3). Reset to "" whenever the user changes the selection.
  const appliedTemplateId = useRef("");
  // What the last apply pushed upstream, so a recipient change can tell an untouched template
  // from one the author has since edited.
  const lastApplied = useRef<AppliedTemplate | null>(null);

  const { data: templates = [] } = trpc.email.templates.list.useQuery();
  const { data: templateDetail } = trpc.email.templates.get.useQuery(
    { id: selectedTemplateId },
    { enabled: selectedTemplateId.length > 0 },
  );
  // Same resolution the send path runs, so the composer previews what will actually ship.
  const mergeQuery = trpc.email.mergeContext.useQuery({ recipientEmail, personId, dealId });
  const mergeCtx = mergeQuery.data ?? EMPTY_MERGE_CONTEXT;

  // Apply template: only when detail arrives for the currently-selected id AND
  // we haven't already applied this selection. Guards against background refetch
  // re-firing after a reset (item 3). Merge values must have settled first, or the
  // template would land with its raw {{tokens}} and never be revisited.
  // A later recipient change re-resolves the same template, but only while what we applied is
  // still there verbatim: otherwise the previous recipient's values would sit in the body under
  // a new address, and an author's own edits would be overwritten.
  useEffect(() => {
    if (templateDetail === undefined) return;
    if (selectedTemplateId === "") return;
    if (mergeQuery.isPending) return;
    const merged = (text: string): string =>
      applyMergeFields(text, mergeCtx, { keepUnresolved: true });
    const next = {
      subject: templateDetail.subject === null ? null : merged(templateDetail.subject),
      body: merged(templateDetail.bodyHtml),
    };
    const apply = shouldApplyTemplate({
      isNewSelection: appliedTemplateId.current !== selectedTemplateId,
      applied: lastApplied.current,
      next,
      currentSubject: subject,
      currentBody: bodyHtml,
    });
    if (!apply) return;
    appliedTemplateId.current = selectedTemplateId;
    lastApplied.current = next;
    if (next.subject !== null) onSubjectChange(next.subject);
    onBodyChange(next.body);
  }, [
    templateDetail,
    selectedTemplateId,
    mergeQuery.isPending,
    mergeCtx,
    subject,
    bodyHtml,
    onSubjectChange,
    onBodyChange,
  ]);

  // Deal context resolves its values client-side from data the page already holds; every other
  // context resolves them from the recipient instead (mergeTokenItems).
  const fields =
    context !== undefined && context.kind === "deal"
      ? insertFields(context)
      : mergeTokenItems(mergeCtx);

  return (
    <div className="flex items-center gap-2 flex-wrap border-b border-border px-2 py-1">
      <div className="w-40">
        <Combobox
          ariaLabel={CHOOSE_TEMPLATE_LABEL}
          value={selectedTemplateId}
          onChange={(next) => {
            // Reset the applied-guard so the new selection triggers the effect.
            appliedTemplateId.current = "";
            lastApplied.current = null;
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
