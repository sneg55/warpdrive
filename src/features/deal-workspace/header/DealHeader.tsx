"use client";
import type React from "react";
import { Badge } from "@/components/ui/Badge";
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
  canDelete: boolean;
  assignableUsers: { id: string; name: string }[];
  isHidden: (id: DealBlockId) => boolean;
  toggle: (id: DealBlockId) => void;
  scheduleFollowUpAfterWon: boolean;
}

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
  const expectedUpdatedAt = new Date(deal.updatedAt).toISOString();
  const currentStageName = stageProgress.chips.find((c) => c.current)?.name ?? null;
  const archived = deal.archivedAt !== null;

  return (
    <div className="mb-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <EditableTitle
            dealId={deal.id}
            title={deal.title}
            expectedUpdatedAt={expectedUpdatedAt}
          />
          {archived && (
            <Badge variant="secondary" className="mt-1">
              Archived
            </Badge>
          )}
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
            archived={archived}
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
