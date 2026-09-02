"use client";
import dynamic from "next/dynamic";
import type React from "react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { trpc } from "@/lib/trpc-client";
import type { FollowUpLinks } from "./followUpLinks";

const FollowUpActivityDialog = dynamic(
  async () => (await import("./FollowUpActivityDialog")).FollowUpActivityDialog,
  { ssr: false },
);

export { type FollowUpLinks, followUpLinksOf } from "./followUpLinks";

export type PromptAfterDone = (links: FollowUpLinks, onCreated?: () => void) => boolean;

interface PendingPrompt {
  seq: number;
  links: FollowUpLinks;
  onCreated?: () => void;
}

const FollowUpPromptContext = createContext<PromptAfterDone>(() => false);

type Utils = ReturnType<typeof trpc.useUtils>;

function invalidateLinkedTimelines(utils: Utils, links: FollowUpLinks): void {
  if (links.dealId !== null) {
    void utils.activities.listForEntity.invalidate({ entityType: "deal", entityId: links.dealId });
  }
  if (links.leadId !== null) void utils.lead.leadTimeline.invalidate({ leadId: links.leadId });
  const contacts: Array<{ entityType: "person" | "organization"; entityId: string }> = [];
  if (links.personId !== null) contacts.push({ entityType: "person", entityId: links.personId });
  if (links.orgId !== null) contacts.push({ entityType: "organization", entityId: links.orgId });
  for (const key of contacts) {
    void utils.activities.listForEntity.invalidate(key);
    void utils.contacts.contactTimeline.invalidate(key);
    void utils.contacts.activityStats.invalidate(key);
  }
}

export function FollowUpPromptProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { scheduleFollowUpAfterDone } = useInterfacePrefs();
  const utils = trpc.useUtils();
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const seqRef = useRef(0);
  const promptAfterDone = useCallback<PromptAfterDone>(
    (links, onCreated) => {
      if (!scheduleFollowUpAfterDone) return false;
      seqRef.current += 1;
      setPending({ seq: seqRef.current, links, onCreated });
      return true;
    },
    [scheduleFollowUpAfterDone],
  );
  const dismissSeq = useCallback((seq: number) => {
    setPending((current) => (current?.seq === seq ? null : current));
  }, []);
  const createdFor = useCallback(
    (prompt: PendingPrompt) => {
      invalidateLinkedTimelines(utils, prompt.links);
      prompt.onCreated?.();
      setPending((current) => (current?.seq === prompt.seq ? null : current));
    },
    [utils],
  );
  return (
    <FollowUpPromptContext.Provider value={promptAfterDone}>
      {children}
      {pending !== null && (
        <FollowUpActivityDialog
          key={pending.seq}
          links={pending.links}
          onCreated={() => createdFor(pending)}
          onClose={() => dismissSeq(pending.seq)}
        />
      )}
    </FollowUpPromptContext.Provider>
  );
}

export function useFollowUpAfterDone(): PromptAfterDone {
  return useContext(FollowUpPromptContext);
}
