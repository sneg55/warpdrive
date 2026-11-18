"use client";
import type React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { SidebarLinkPanel } from "./SidebarLinkPanel";

interface InboxReaderSidebarProps {
  participants: string[];
  threadId: string;
  personId: string | null;
  personName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  subject: string | null;
  primaryEmail: string | null;
  primaryName: string | null;
  canCompose: boolean;
  onLinked: () => void;
}

export function InboxReaderSidebar({
  participants,
  threadId,
  personId,
  personName,
  dealId,
  dealTitle,
  subject,
  primaryEmail,
  primaryName,
  canCompose,
  onLinked,
}: InboxReaderSidebarProps): React.ReactNode {
  return (
    <aside aria-label="Conversation details" className="w-72 shrink-0 space-y-4 border-l p-4">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground tabular-nums">
          {participants.length} people in this conversation
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {participants.map((email) => (
            <Avatar key={email} name={email} className="h-7 w-7 text-[10px]" />
          ))}
        </div>
      </section>

      {primaryEmail !== null && (
        <section className="flex items-center gap-2 rounded-md border p-3">
          <Avatar name={primaryName ?? primaryEmail} className="h-8 w-8 text-xs" />
          <span className="min-w-0 truncate text-sm font-medium">
            {primaryName ?? primaryEmail}
          </span>
        </section>
      )}

      <SidebarLinkPanel
        threadId={threadId}
        personId={personId}
        personName={personName}
        dealId={dealId}
        dealTitle={dealTitle}
        subject={subject}
        primaryEmail={primaryEmail}
        primaryName={primaryName}
        canEdit={canCompose}
        onLinked={onLinked}
      />
    </aside>
  );
}
