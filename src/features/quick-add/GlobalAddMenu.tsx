"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddActivityModal } from "@/features/activities/AddActivityModal";
import { AddDealModal } from "@/features/deals/AddDealModal";
import { AddLeadModal } from "@/features/leads/AddLeadModal";
import { trpc } from "@/lib/trpc-client";
import { GlobalContactModal } from "./GlobalContactModal";
import { GlobalNoteModal } from "./GlobalNoteModal";

type ModalKind = "deal" | "lead" | "activity" | "person" | "org" | "note" | null;

interface Entry {
  key: string;
  label: string;
  shortcut: string;
}

// Entries in menu order (Pipedrive Lead/Deal/Activity/Person/Organization/Note/Email; Product is
// out of scope). Note opens a target-picker modal; Email routes to the standalone compose surface.
const ENTRIES: Entry[] = [
  { key: "lead", label: "Lead", shortcut: "L" },
  { key: "deal", label: "Deal", shortcut: "D" },
  { key: "activity", label: "Activity", shortcut: "A" },
  { key: "person", label: "Person", shortcut: "P" },
  { key: "org", label: "Organization", shortcut: "O" },
  { key: "note", label: "Note", shortcut: "N" },
  { key: "email", label: "Email", shortcut: "E" },
];

// The global "+" quick-add next to the search box (Pipedrive parity): opens a menu whose entries
// launch the matching create modal from any page. Built on the shadcn DropdownMenu primitive
// (focus trap, arrow/Escape nav, portal); the letter shortcuts (L/D/A/P/O) stay wired via an
// onKeyDown on the content so a single keypress fires the matching modal while the menu is open.
export function GlobalAddMenu(): React.ReactNode {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);

  // No `retry: false`: a transient cold-start error must recover so the query resolves and Deal
  // becomes createable, rather than sticking on undefined data and leaving Deal permanently gated.
  const pipelinesQ = trpc.pipeline.list.useQuery();
  const pipelines = useMemo(
    () =>
      (pipelinesQ.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        stages: p.stages.map((s) => ({ id: s.id, name: s.name })),
      })),
    [pipelinesQ.data],
  );
  const firstPipelineId = pipelines[0]?.id ?? null;

  // Only disable Deal once the query has actually resolved to zero pipelines. While it is loading
  // or errored (data still undefined, and retry is off) firstPipelineId is null too, but that is
  // not "no pipelines exist" (a fresh install has a seeded default), so Deal must stay enabled.
  const noPipelines = pipelinesQ.isSuccess && pipelines.length === 0;

  const isDisabled = useCallback(
    (entry: Entry): boolean => entry.key === "deal" && noPipelines,
    [noPipelines],
  );

  const choose = useCallback(
    (entry: Entry): void => {
      if (isDisabled(entry)) return;
      setOpen(false);
      // Email has no entity-less create modal: route to the full-pane inbox compose surface.
      if (entry.key === "email") {
        router.push("/inbox/compose");
        return;
      }
      setModal(entry.key as ModalKind);
    },
    [isDisabled, router],
  );

  const onContentKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      const entry = ENTRIES.find((x) => x.shortcut.toLowerCase() === e.key.toLowerCase());
      if (entry !== undefined) {
        e.preventDefault();
        choose(entry);
      }
    },
    [choose],
  );

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Quick add"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-action text-lg font-medium text-action-foreground transition-transform hover:opacity-90 active:scale-[0.96]"
          >
            <span aria-hidden="true">+</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onKeyDown={onContentKeyDown}>
          {ENTRIES.map((entry) => (
            <DropdownMenuItem
              key={entry.key}
              disabled={isDisabled(entry)}
              onSelect={() => choose(entry)}
              className="justify-between"
            >
              <span>{entry.label}</span>
              <kbd className="rounded border bg-muted px-1.5 text-xs text-muted-foreground">
                {entry.shortcut}
              </kbd>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {modal === "deal" && firstPipelineId !== null && (
        <AddDealModal
          pipelineId={firstPipelineId}
          pipelines={pipelines}
          onClose={() => setModal(null)}
          onCreated={() => router.refresh()}
        />
      )}
      {modal === "lead" && (
        <AddLeadModal onClose={() => setModal(null)} onCreated={() => router.refresh()} />
      )}
      {modal === "activity" && (
        <AddActivityModal onClose={() => setModal(null)} onCreated={() => router.refresh()} />
      )}
      {(modal === "person" || modal === "org") && (
        <GlobalContactModal
          kind={modal === "person" ? "person" : "org"}
          onClose={() => setModal(null)}
          onCreated={() => router.refresh()}
        />
      )}
      {modal === "note" && (
        <GlobalNoteModal onClose={() => setModal(null)} onCreated={() => router.refresh()} />
      )}
    </>
  );
}
