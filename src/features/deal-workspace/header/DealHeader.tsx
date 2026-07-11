"use client";
import type React from "react";
import type { DealBlockId } from "@/constants/dealBlocks";
import { wsChannel } from "@/constants/wsChannels";
import { DealCloseActions } from "@/features/deal-workspace/DealCloseActions";
import type { DealWorkspace } from "@/features/deal-workspace/summaryRepo";
import { PresenceBar } from "@/features/presence/ui/PresenceBar";
import { BlockVisibilityButton } from "./BlockVisibilityButton";
import { DealActionsMenu } from "./DealActionsMenu";
import { EditableTitle } from "./EditableTitle";
import { FollowersButton } from "./FollowersButton";
import { OwnerBlock } from "./OwnerBlock";
import { PipelineBreadcrumb } from "./PipelineBreadcrumb";
import { StageSelector } from "./StageSelector";

interface DealHeaderProps {
  workspace: DealWorkspace;
  selfActorId: string;
  canChangeOwner: boolean;
  // Whether the actor holds deal.delete (own/any) for this deal; gates the overflow Delete item.
  canDelete: boolean;
  assignableUsers: { id: string; name: string }[];
  // Block-visibility state lifted to DealWorkspaceClient so the hidden set can gate sibling
  // sections; the header only reads isHidden (for the button) and calls toggle on click.
  isHidden: (id: DealBlockId) => boolean;
  toggle: (id: DealBlockId) => void;
  // Personal preference (user_preferences.ui.scheduleFollowUpAfterWon), passed through to
  // DealCloseActions so a successful Won can prompt to schedule a follow-up activity.
  scheduleFollowUpAfterWon: boolean;
}

// Two-row deal-detail header (Pipedrive parity). Row 1: editable title + a right cluster of owner,
// followers, presence, close actions, block-visibility, and the overflow menu. Row 2: the
// interactive stage selector + pipeline breadcrumb. Layout only; each control owns its own logic.
export function DealHeader({
  workspace,
  selfActorId,
  canChangeOwner,
  canDelete,
  assignableUsers,
  isHidden,
  toggle,
  scheduleFollowUpAfterWon,
}: DealHeaderProps): React.ReactNode {
  const {
    deal,
    owner,
    stageProgress,
    lostReasonOptions,
    lostReasonName,
    followers,
    isFollowedBySelf,
    pipelineName,
  } = workspace;
  // Deal.updatedAt may arrive as a Date (RSC) or string; normalize to the ISO CAS precondition.
  const expectedUpdatedAt = new Date(deal.updatedAt).toISOString();
  const currentStageName = stageProgress.chips.find((c) => c.current)?.name ?? null;

  return (
    <div className="mb-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <EditableTitle
            dealId={deal.id}
            title={deal.title}
            expectedUpdatedAt={expectedUpdatedAt}
          />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <OwnerBlock
            dealId={deal.id}
            expectedUpdatedAt={expectedUpdatedAt}
            owner={owner}
            canChangeOwner={canChangeOwner}
            assignableUsers={assignableUsers}
          />
          <FollowersButton
            dealId={deal.id}
            followers={followers}
            isFollowedBySelf={isFollowedBySelf}
          />
          <PresenceBar channel={wsChannel.deal(deal.id)} selfId={selfActorId} />
          <DealCloseActions
            dealId={deal.id}
            status={deal.status}
            lostReasonOptions={lostReasonOptions}
            lostReasonName={lostReasonName}
            lostReasonText={deal.lostReason}
            scheduleFollowUpAfterWon={scheduleFollowUpAfterWon}
          />
          <BlockVisibilityButton isHidden={isHidden} onToggle={toggle} />
          <DealActionsMenu
            dealId={deal.id}
            pipelineId={deal.pipelineId}
            expectedUpdatedAt={expectedUpdatedAt}
            canDelete={canDelete}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <StageSelector
            dealId={deal.id}
            expectedUpdatedAt={expectedUpdatedAt}
            chips={stageProgress.chips}
          />
        </div>
        <PipelineBreadcrumb
          pipelineId={deal.pipelineId}
          pipelineName={pipelineName}
          currentStageName={currentStageName}
        />
      </div>
    </div>
  );
}
