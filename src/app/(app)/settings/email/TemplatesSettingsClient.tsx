"use client";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import type React from "react";
import { useMemo, useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Checkbox } from "@/components/ui/Checkbox";
import { FIELD_INPUT } from "@/constants/formStyles";
import { reorderByDrag } from "@/features/custom-fields/reorderDrag";
import {
  createTemplateAction,
  deleteTemplateAction,
  deleteTemplatesAction,
  reorderTemplatesAction,
  updateTemplateAction,
} from "@/features/email/authoringActions";
import type { SettingsTemplate } from "@/features/email/emailAuthoringReads";
import { readCsrfToken } from "@/utils/csrfCookie";
import { formatCreatedOn } from "./formatDate";
import { EMAIL_SETTINGS_STRINGS as S } from "./strings";
import { type TemplateDraft, TemplateDraftEditor } from "./TemplateDraftEditor";
import { TemplateRow } from "./TemplateRow";

export function TemplatesSettingsClient({
  templates,
  canShare,
}: {
  templates: SettingsTemplate[];
  canShare: boolean;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const csrf = (): string | null => readCsrfToken();

  // T4c optimistic order over ALL own ids (unfiltered). Resync during render (not an effect) when
  // the server list changes: compare a stable key and adjust state, the React-sanctioned pattern.
  const allOwnIds = useMemo(() => templates.filter((t) => t.isOwn).map((t) => t.id), [templates]);
  const ownKey = allOwnIds.join(",");
  const [order, setOrder] = useState<string[]>(allOwnIds);
  const [syncedKey, setSyncedKey] = useState(ownKey);
  if (syncedKey !== ownKey) {
    setSyncedKey(ownKey);
    setOrder(allOwnIds);
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // T2: case-insensitive substring filter by name; empty query shows all.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? templates : templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [templates, query]);

  const ownRows = useMemo(
    () => filtered.filter((t) => t.isOwn).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
    [filtered, order],
  );
  const sharedRows = filtered.filter((t) => !t.isOwn);
  const ownViewIds = ownRows.map((t) => t.id);
  const selectedInView = ownViewIds.filter((id) => selected.has(id));
  const allChecked: boolean | "indeterminate" =
    ownViewIds.length > 0 && selectedInView.length === ownViewIds.length
      ? true
      : selectedInView.length > 0
        ? "indeterminate"
        : false;

  function toggleOne(id: string, on: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(on: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ownViewIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function save(): Promise<void> {
    if (draft === null || draft.name.trim() === "") return;
    const payload = {
      name: draft.name,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      isShared: draft.isShared,
    };
    const r =
      draft.id === undefined
        ? await createTemplateAction(csrf(), payload)
        : await updateTemplateAction(csrf(), { id: draft.id, patch: payload });
    if (r.ok) {
      setDraft(null);
      router.refresh();
    } else reportError(r.error.id);
  }

  async function remove(id: string): Promise<void> {
    const r = await deleteTemplateAction(csrf(), { id });
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  async function bulkDelete(): Promise<void> {
    const ids = [...selected];
    if (ids.length === 0) return;
    const r = await deleteTemplatesAction(csrf(), { ids });
    if (r.ok) {
      setSelected(new Set());
      router.refresh();
    } else reportError(r.error.id);
  }

  async function onDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    const prev = order;
    const next = reorderByDrag(order, String(active.id), String(over.id));
    setOrder(next); // optimistic
    const r = await reorderTemplatesAction(csrf(), { orderedIds: next });
    // On failure, restore the exact prior order directly: router.refresh() returns the same id set,
    // so ownKey is unchanged and the render-time resync would leave the failed order stuck.
    if (!r.ok) {
      setOrder(prev);
      reportError(r.error.id);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{S.templates}</h2>
        <button
          type="button"
          className="rounded-md bg-action px-3 py-1.5 text-sm font-medium text-action-foreground transition-transform hover:opacity-90 active:scale-[0.96]"
          onClick={() => setDraft({ name: "", subject: "", bodyHtml: "", isShared: false })}
        >
          {S.newTemplate}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          aria-label={S.searchTemplates}
          placeholder={S.searchTemplates}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={FIELD_INPUT}
        />
        {selected.size > 0 && (
          <button
            type="button"
            className="whitespace-nowrap rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive transition-transform active:scale-[0.96]"
            onClick={() => void bulkDelete()}
          >
            {S.deleteSelected}
          </button>
        )}
      </div>

      <ul className="divide-y rounded-md border">
        {(ownViewIds.length > 0 || sharedRows.length > 0) && (
          <li className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-muted-foreground">
            {/* Drag-handle column spacer so the header aligns with the rows below (own rows lead
                with a drag handle, shared rows with a matching spacer). */}
            <span className="h-4 w-4" />
            {ownViewIds.length > 0 ? (
              <Checkbox checked={allChecked} onCheckedChange={toggleAll} label={S.selectAll} />
            ) : (
              <span className="h-4 w-4" />
            )}
            <span className="flex-1">{S.nameHeader}</span>
            <span className="w-28">{S.createdOnHeader}</span>
            <span className="w-24">{S.ownerHeader}</span>
          </li>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => void onDragEnd(e)}
        >
          <SortableContext items={ownViewIds} strategy={verticalListSortingStrategy}>
            {ownRows.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                selected={selected.has(t.id)}
                onToggle={(v) => toggleOne(t.id, v)}
                onEdit={() =>
                  setDraft({
                    id: t.id,
                    name: t.name,
                    subject: t.subject ?? "",
                    bodyHtml: t.bodyHtml,
                    isShared: t.isShared,
                  })
                }
                onDelete={() => void remove(t.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {sharedRows.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="h-4 w-4" />
            <span className="h-4 w-4" />
            <span className="flex flex-1 items-center gap-2">
              {t.name}
              {t.isShared && (
                <span className="rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
                  {S.sharedBadge}
                </span>
              )}
            </span>
            <span className="w-28 text-xs text-muted-foreground">
              {formatCreatedOn(t.createdAt)}
            </span>
            <span className="w-24 text-xs text-muted-foreground">{t.ownerName}</span>
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">{S.empty}</li>
        )}
      </ul>

      {draft !== null && (
        <TemplateDraftEditor
          draft={draft}
          canShare={canShare}
          onChange={setDraft}
          onSave={() => void save()}
          onCancel={() => setDraft(null)}
        />
      )}
    </section>
  );
}
