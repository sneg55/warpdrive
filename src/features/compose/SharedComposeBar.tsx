"use client";
import Link from "next/link";
import type React from "react";
import { useState } from "react";
import { ActivityComposerInline } from "@/features/deal-workspace/composer/ActivityComposerInline";
import {
  ActivityIcon,
  EmailIcon,
  FilesIcon,
  NotesIcon,
} from "@/features/deal-workspace/composeTabIcons";
import { Composer } from "@/features/email/Composer";
import { preloadRichTextBody } from "@/features/email/composer/RichTextBodyLazy";
import { FileAttachments } from "@/features/files/FileAttachments";
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

// Pipedrive's per-tab "default state" prompts. Only Activity and Notes collapse to a
// prompt; Email and Files render their content directly (PD does the same).
const PROMPTS: Partial<Record<ComposeTab, string>> = {
  activity: "Click here to add an activity...",
  notes: "Take a note...",
};

// Activity and Notes are enabled for every scope; Email and Files are scope-gated
// (see emailTabEnabled/fileTabEnabled in composeScope.ts). "activity" is always
// present, so the tab state's "activity" default (below) never points at a hidden tab.
function tabsForScope(scope: ComposeScope): TabDef[] {
  return ALL_TABS.filter((t) => {
    if (t.id === "email") return emailTabEnabled(scope);
    if (t.id === "files") return fileTabEnabled(scope);
    return true;
  });
}

interface Props {
  scope: ComposeScope;
  // The viewer's connected Gmail mailbox id (from email_accounts), or null if none linked.
  emailAccountId: string | null;
  // The sender mailbox address, shown in the From row of the composer.
  emailAddress?: string;
  onActivityCreated: () => void;
  onNoteCreated: () => void;
}

// Tabbed composer matching Pipedrive's model exactly (minus out-of-scope Call/Documents/
// Invoice tabs): the tab strip is ALWAYS visible; Activity and Notes start as a 60px
// one-line prompt under the strip, clicking a tab or its prompt expands that tab's editor,
// and the editor's Cancel collapses back to the prompt. There is no separate collapse
// control in the strip (PD has none). Parameterized by ComposeScope so the same component
// mounts on deal, lead, person, or org.
//
// Email still assumes a deal underneath (Composer's context.kind: "deal"), so it is only
// shown when emailTabEnabled(scope) is true (deal scope only). Activity and Notes derive
// their entity mapping from the scope via activityAnchor()/noteEntityType(), so they work
// correctly for every scope.
export function SharedComposeBar({
  scope,
  emailAccountId,
  emailAddress,
  onActivityCreated,
  onNoteCreated,
}: Props): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<ComposeTab>("activity");
  const tabs = tabsForScope(scope);

  // PD expands the clicked tab's editor immediately, even from the collapsed prompt.
  function openTab(id: ComposeTab): void {
    setTab(id);
    setExpanded(true);
  }

  // Leaving the Email composer (sent or closed) lands on the collapsed Activity prompt,
  // not an expanded activity editor.
  function backToActivityPrompt(): void {
    setTab("activity");
    setExpanded(false);
  }

  const prompt = PROMPTS[tab];
  const showPrompt = !expanded && prompt !== undefined;

  return (
    <section aria-label="compose" className="mb-4 rounded border bg-card">
      <div role="tablist" className="flex items-center overflow-x-auto border-b">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => openTab(id)}
            className={
              tab === id
                ? "-mb-px flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-[#2b74da] px-3 text-start text-sm font-[450] text-link"
                : "-mb-px flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-start text-sm font-[450] text-muted-foreground hover:text-foreground"
            }
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>

      {showPrompt ? (
        <ComposeCollapsedTrigger
          label={prompt}
          onExpand={() => setExpanded(true)}
          onPreload={preloadRichTextBody}
        />
      ) : (
        <div className="p-1.5">
          {tab === "activity" && (
            <ActivityComposerInline
              {...activityAnchor(scope)}
              personName={scope.personName}
              dealTitle={scope.dealTitle}
              orgName={scope.orgName}
              onCreated={onActivityCreated}
              onCancel={() => setExpanded(false)}
            />
          )}

          {tab === "notes" && (
            <ComposeNoteTab
              entityType={noteEntityType(scope)}
              entityId={scope.entityId}
              onNoteCreated={onNoteCreated}
              onCancel={() => setExpanded(false)}
            />
          )}

          {tab === "email" &&
            emailTabEnabled(scope) &&
            (emailAccountId !== null ? (
              <div className="p-1.5">
                <Composer
                  accountId={emailAccountId}
                  fromAddress={emailAddress}
                  context={dealComposerContext(scope)}
                  onSent={backToActivityPrompt}
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

          {tab === "files" &&
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
