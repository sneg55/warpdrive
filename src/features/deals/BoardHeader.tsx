"use client";
import type React from "react";
import { wsChannel } from "@/constants/wsChannels";
import { PresenceBar } from "@/features/presence/ui/PresenceBar";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { BoardFilterChips } from "./BoardFilterChips";
import { BoardFilterControl } from "./BoardFilterControl";
import { BoardSortControl } from "./BoardSortControl";
import { BoardToolbar } from "./BoardToolbar";
import type { BoardOwner } from "./boardFilter";
import type { BoardProps } from "./boardTypes";
import type { BoardViewControls } from "./useBoardView";

// An owner whose every deal is excluded is absent from `owners`, so the chip still reports the
// board is narrowed even when the visible cards cannot name them.
const UNNAMED_OWNER = "Unknown";

interface BoardHeaderProps {
  pipelineId: string;
  pipelines: BoardProps["pipelines"];
  stages: BoardProps["stages"];
  selfActorId: string;
  owners: BoardOwner[];
  totalValue: string;
  dealCount: number;
  view: BoardViewControls;
  addSlot: React.ReactNode;
  onPreviewFilter: (definition: FilterDefinition | null) => void;
}

// Everything above the stage columns: the toolbar with its filter/sort/create slots, and the row
// of chips naming each narrowing dimension the board currently applies.
export function BoardHeader(props: BoardHeaderProps): React.ReactNode {
  const { pipelineId, pipelines, stages, selfActorId, owners, view, addSlot } = props;
  const { totalValue, dealCount, onPreviewFilter } = props;
  const ownerName =
    view.ownerId === null
      ? null
      : (owners.find((o) => o.ownerId === view.ownerId)?.name ?? UNNAMED_OWNER);

  return (
    <BoardToolbar
      pipelineId={pipelineId}
      pipelines={pipelines}
      totalValue={totalValue}
      dealCount={dealCount}
      createSlot={addSlot}
      sortSlot={
        <BoardSortControl
          sortKey={view.sortKey}
          direction={view.sortDir}
          onKeyChange={view.setSortKey}
          onToggleDirection={view.toggleSortDirection}
        />
      }
      filterSlot={
        <BoardFilterControl
          owners={owners}
          stages={stages}
          selectedOwnerId={view.ownerId}
          currentUserId={selfActorId}
          onSelectOwner={view.setOwnerId}
          selectedFilterId={view.savedFilter?.id ?? null}
          onSelectFilter={view.setSavedFilter}
          appliedDefinition={view.conditions}
          onApplyDefinition={view.setConditions}
          activeCount={view.conditions?.conditions.length ?? 0}
          onPreviewFilter={onPreviewFilter}
          onClearPreview={() => onPreviewFilter(null)}
        />
      }
      quickFilters={
        <BoardFilterChips
          ownerName={ownerName}
          savedFilterName={view.savedFilter?.name ?? null}
          conditionCount={view.conditions?.conditions.length ?? 0}
          onClearOwner={() => view.setOwnerId(null)}
          onClearSavedFilter={() => view.setSavedFilter(null)}
          onClearConditions={() => view.setConditions(null)}
          onClearAll={view.clearFilters}
        />
      }
      presence={<PresenceBar channel={wsChannel.pipeline(pipelineId)} selfId={selfActorId} />}
    />
  );
}
