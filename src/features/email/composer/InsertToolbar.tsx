"use client";

// InsertToolbar: holds "Choose template" and "Insert field" controls.
// Choosing a template fetches its body via email.templates.get and calls
// onSubjectChange + onBodyChange so the parent Composer can set state.
// Choosing an insert field calls onInsertField with the resolved value so
// the parent can insert it at the editor cursor.
import { useEffect, useRef, useState } from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { trpc } from "@/lib/trpc-client";
import { InsertFieldMenu } from "./InsertFieldMenu";
import { type InsertFieldContext, insertFields } from "./insertFields";

const CHOOSE_TEMPLATE_LABEL = "Choose template";

interface InsertToolbarProps {
  onSubjectChange: (subject: string) => void;
  onBodyChange: (bodyHtml: string) => void;
  // context is optional; when provided and kind="deal", shows Insert field menu.
  context?: InsertFieldContext;
  // Called with the resolved field value when the user picks an insert field.
  onInsertField?: (value: string) => void;
}

export function InsertToolbar({
  onSubjectChange,
  onBodyChange,
  context,
  onInsertField,
}: InsertToolbarProps): React.ReactNode {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
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

  const fields = context !== undefined ? insertFields(context) : [];

  return (
    <div className="flex items-center gap-2 flex-wrap border-b border-border px-2 py-1">
      <div className="w-32">
        <Select
          ariaLabel={CHOOSE_TEMPLATE_LABEL}
          value={selectedTemplateId}
          onChange={(next) => {
            // Reset the applied-guard so the new selection triggers the effect.
            appliedTemplateId.current = "";
            setSelectedTemplateId(next);
          }}
          placeholder={CHOOSE_TEMPLATE_LABEL}
          options={templates.map<SelectOption>((t) => ({ value: t.id, label: t.name }))}
        />
      </div>

      <InsertFieldMenu items={fields} onInsert={(v) => onInsertField?.(v)} />
    </div>
  );
}
