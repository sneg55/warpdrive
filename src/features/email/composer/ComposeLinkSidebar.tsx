"use client";
import type React from "react";
import { useState, useSyncExternalStore } from "react";
import { STRINGS } from "@/constants/strings";
import { AddDealModal } from "@/features/deals/AddDealModal";
import { trpc } from "@/lib/trpc-client";
import { LinkExistingCombobox } from "../LinkExistingCombobox";

const S = STRINGS.inbox;

// Hydration-safe "on the client yet" flag. getServerSnapshot returns false, so the server HTML and
// the first client render agree; the client then swaps to true on the next render. Used to gate a
// pipeline-query-dependent `disabled` attribute so it never differs between server and client at
// hydration time (a setState-in-effect mount flag is banned by the react-hooks lint rule).
const subscribeNoop = (): (() => void) => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

interface ComposeLinkSidebarProps {
  dealId: string | null;
  dealTitle: string | null;
  onLink: (id: string, title: string) => void;
  onUnlink: () => void;
}

// Compose-time deal link picker (Pipedrive parity). Unlike SidebarLinkPanel (which mutates an
// EXISTING thread's link immediately via linkThread), there is no thread yet at compose time: this
// is a controlled component that only lifts the chosen dealId/title up to ComposePageClient state.
// The page then passes it into Composer as linkDealId, and the send path (useComposerSend.ts,
// send.ts) links the new outbound thread to that deal, re-verifying visibility server-side.
export function ComposeLinkSidebar({
  dealId,
  dealTitle,
  onLink,
  onUnlink,
}: ComposeLinkSidebarProps): React.ReactNode {
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const isClient = useIsClient();

  const pipelinesQ = trpc.pipeline.list.useQuery();
  const pipelines = (pipelinesQ.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: p.stages.map((s) => ({ id: s.id, name: s.name })),
  }));
  const firstPipelineId = pipelines[0]?.id ?? null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {S.linkDealSidebarHeading}
      </h3>
      {dealId === null && (
        <p className="text-xs text-muted-foreground">{S.linkDealSidebarHelper}</p>
      )}
      {dealId !== null ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
          <span className="min-w-0 truncate text-sm font-medium">
            {dealTitle ?? S.linkedDealFallback}
          </span>
          <button
            type="button"
            onClick={onUnlink}
            className="shrink-0 text-xs text-primary hover:underline"
          >
            {S.unlinkDeal}
          </button>
        </div>
      ) : (
        <>
          <LinkExistingCombobox kind="deal" triggerLabel={S.linkExisting} onPick={onLink} />
          <button
            type="button"
            disabled={!isClient || firstPipelineId === null}
            onClick={() => setDealModalOpen(true)}
            className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50"
          >
            {S.addNewDeal}
          </button>
        </>
      )}

      {dealModalOpen && firstPipelineId !== null && (
        <AddDealModal
          pipelineId={firstPipelineId}
          pipelines={pipelines}
          onClose={() => setDealModalOpen(false)}
          onCreated={(id, title) => {
            setDealModalOpen(false);
            onLink(id, title);
          }}
          // The unsent email + just-picked link are local state only: never navigate away from
          // the composer, even when the user's "open details after create" preference is on.
          suppressDetailNav
        />
      )}
    </div>
  );
}
