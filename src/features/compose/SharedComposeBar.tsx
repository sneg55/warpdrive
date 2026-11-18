"use client";
import Link from "next/link";
import type React from "react";
import { useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EditableActivity } from "@/features/activities/getForEdit";
import { ActivityComposerInline } from "@/features/deal-workspace/composer/ActivityComposerInline";
import {
  ActivityIcon,
  EmailIcon,
  FilesIcon,
  NotesIcon,
} from "@/features/deal-workspace/composeTabIcons";
import { Composer } from "@/features/email/Composer";
import { preloadRichTextBody } from "@/features/email/composer/RichTextBodyLazy";
import type { DraftSummary } from "@/features/email/draftRepo";
import { invalidateRecordTimelines } from "@/features/email/invalidateRecordTimelines";
import { toComposerDraft } from "@/features/email/toComposerDraft";
import { FileAttachments } from "@/features/files/FileAttachments";
import { trpc } from "@/lib/trpc-client";
import { ComposeCollapsedTrigger } from "./ComposeCollapsedTrigger";
import { ComposeNoteTab } from "./ComposeNoteTab";
import {
  activityAnchor,
  type ComposeScope,
  dealComposerContext,
  emailTabEnabled,
  fileEntityType,
  fileTabEnabled,
  noteEntityType,
} from "./composeScope";

type ComposeTab = "activity" | "notes" | "email" | "files";

interface TabDef {
  id: ComposeTab;
  label: string;
  Icon: () => React.ReactNode;
}

const ALL_TABS: TabDef[] = [
  { id: "activity", label: "Activity", Icon: ActivityIcon },
  { id: "notes", label: "Notes", Icon: NotesIcon },
  { id: "email", label: "Email", Icon: EmailIcon },
  { id: "files", label: "Files", Icon: FilesIcon },
];

const PROMPTS: Partial<Record<ComposeTab, string>> = {
  activity: "Click here to add an activity...",
  notes: "Take a note...",
};

function tabsForScope(scope: ComposeScope): TabDef[] {
  const enabled = ALL_TABS.filter((t) => {
    if (t.id === "email") return emailTabEnabled(scope);
    if (t.id === "files") return fileTabEnabled(scope);
    return true;
  });
  if (scope.entityType === "lead") {
    return [...enabled].sort((a, b) => rank(a.id) - rank(b.id));
  }
  return enabled;
}

function rank(id: ComposeTab): number {
  if (id === "notes") return 0;
  if (id === "activity") return 1;
  return 2;
}

interface Props {
  scope: ComposeScope;
  emailAccountId: string | null;
  emailAddress?: string;
  onActivityCreated: () => void;
  onNoteCreated: () => void;
  editing?: EditableActivity | null;
  resumeDraft?: DraftSummary | null;
  onResumeDraftDone?: () => void;
  onEditSaved?: () => void;
  onEditCancel?: () => void;
}

export function SharedComposeBar({
  scope,
  emailAccountId,
  emailAddress,
  onActivityCreated,
  onNoteCreated,
  editing,
  resumeDraft,
  onResumeDraftDone,
  onEditSaved,
  onEditCancel,
}: Props): React.ReactNode {
  const composeRef = useRef<HTMLElement>(null);
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  const tabs = tabsForScope(scope);
  const [tab, setTab] = useState<ComposeTab>(() => tabs[0]?.id ?? "activity");
  const resuming = resumeDraft != null;
  const activeTab = resuming ? "email" : tab;

  function openTab(id: ComposeTab): void {
    setTab(id);
    setExpanded(true);
    requestAnimationFrame(() => {
      composeRef.current
        ?.querySelector<HTMLElement>(`[data-compose-primary="${id}"]`)
        ?.focus({ preventScroll: true });
    });
  }

  function backToActivityPrompt(): void {
    onResumeDraftDone?.();
    setTab("activity");
    setExpanded(false);
  }

  function onEmailSent(): void {
    invalidateRecordTimelines(utils);
    backToActivityPrompt();
  }

  const prompt = PROMPTS[activeTab];
  const showPrompt = !resuming && !expanded && prompt !== undefined;

  return (
    <section ref={composeRef} aria-label="compose" className="mb-4 rounded border bg-card">
      <Tabs value={activeTab} onValueChange={(v) => openTab(v as ComposeTab)}>
        <TabsList className="overflow-x-auto shadow-[inset_0_-1px_0_0_var(--color-border)]">
          {tabs.map(({ id, label, Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              onClick={() => openTab(id)}
              className="flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-start font-[450] text-muted-foreground hover:text-foreground data-[state=active]:border-[#2b74da] data-[state=active]:text-link"
            >
              <Icon />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {editing != null ? (
        <div className="p-1.5">
          <ActivityComposerInline
            {...activityAnchor(scope)}
            personName={scope.personName}
            dealTitle={scope.dealTitle}
            orgName={scope.orgName}
            editing={editing}
            onCreated={() => onEditSaved?.()}
            onCancel={() => onEditCancel?.()}
          />
        </div>
      ) : showPrompt ? (
        <ComposeCollapsedTrigger
          label={prompt}
          onExpand={() => openTab(tab)}
          onPreload={preloadRichTextBody}
        />
      ) : (
        <div className="p-1.5">
          {activeTab === "activity" && (
            <ActivityComposerInline
              {...activityAnchor(scope)}
              personName={scope.personName}
              dealTitle={scope.dealTitle}
              orgName={scope.orgName}
              onCreated={() => {
                setExpanded(false);
                onActivityCreated();
              }}
              onCancel={() => setExpanded(false)}
            />
          )}

          {activeTab === "notes" && (
            <ComposeNoteTab
              entityType={noteEntityType(scope)}
              entityId={scope.entityId}
              onNoteCreated={onNoteCreated}
              onCancel={() => setExpanded(false)}
            />
          )}

          {activeTab === "email" &&
            emailTabEnabled(scope) &&
            (emailAccountId !== null ? (
              <div className="p-1.5">
                <Composer
                  key={resumeDraft?.id ?? "fresh"}
                  accountId={emailAccountId}
                  fromAddress={emailAddress}
                  context={dealComposerContext(scope)}
                  draft={resumeDraft == null ? undefined : toComposerDraft(resumeDraft)}
                  onSent={onEmailSent}
                  onClose={backToActivityPrompt}
                />
              </div>
            ) : (
              <p className="px-3 py-4 text-sm text-muted-foreground text-pretty">
                Connect a Gmail mailbox in the{" "}
                <Link href="/inbox" className="text-primary hover:underline">
                  Inbox
                </Link>{" "}
                to send email from here.
              </p>
            ))}

          {activeTab === "files" &&
            (() => {
              const filesEntityType = fileEntityType(scope);
              if (filesEntityType === null) return null;
              return (
                <div className="p-1.5">
                  <FileAttachments entityType={filesEntityType} entityId={scope.entityId} />
                </div>
              );
            })()}
        </div>
      )}
    </section>
  );
}
