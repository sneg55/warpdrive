"use client";

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

const TOKEN_CATEGORY: Record<string, "Person" | "Deal" | "Organization"> = {
  person: "Person",
  deal: "Deal",
  org: "Organization",
};

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
const EMPTY_MERGE_CONTEXT: Record<string, string> = {};

interface InsertToolbarProps {
  onSubjectChange: (subject: string) => void;
  subjectLocked?: boolean;
  onBodyChange: (bodyHtml: string) => void;
  context?: InsertFieldContext;
  onInsertField?: (value: string) => void;
  subject?: string;
  bodyHtml?: string;
  recipientEmail?: string;
  personId?: string | null;
  dealId?: string | null;
}

function templateSubject(subject: string | null, locked: boolean): string | null {
  if (locked || subject === null || subject.trim() === "") return null;
  return subject;
}

export function InsertToolbar({
  onSubjectChange,
  subjectLocked = false,
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
  const [saveOpen, setSaveOpen] = useState(false);
  const appliedTemplateId = useRef("");
  const lastApplied = useRef<AppliedTemplate | null>(null);

  const { data: templates = [] } = trpc.email.templates.list.useQuery();
  const { data: templateDetail } = trpc.email.templates.get.useQuery(
    { id: selectedTemplateId },
    { enabled: selectedTemplateId.length > 0 },
  );
  const mergeQuery = trpc.email.mergeContext.useQuery({ recipientEmail, personId, dealId });
  const mergeCtx = mergeQuery.data ?? EMPTY_MERGE_CONTEXT;

  useEffect(() => {
    if (templateDetail === undefined) return;
    if (selectedTemplateId === "") return;
    if (mergeQuery.isPending) return;
    const merged = (text: string): string =>
      applyMergeFields(text, mergeCtx, { keepUnresolved: true });
    const rawSubject = templateSubject(templateDetail.subject, subjectLocked);
    const next = {
      subject: rawSubject === null ? null : merged(rawSubject),
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
    subjectLocked,
    bodyHtml,
    onSubjectChange,
    onBodyChange,
  ]);

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
            appliedTemplateId.current = "";
            lastApplied.current = null;
            setSelectedTemplateId(next);
          }}
          placeholder={CHOOSE_TEMPLATE_LABEL}
          options={templates.map<ComboboxOption>((t) => ({ value: t.id, label: t.name }))}
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
