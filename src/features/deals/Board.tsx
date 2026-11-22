"use client";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  defaultKeyboardCoordinateGetter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLabelColorResolver } from "@/features/labels/useLabelColorResolver";
import { capture, currentRoute } from "@/features/observability/capture";
import { EVENTS } from "@/features/observability/events";
import { hasDateCondition } from "@/features/saved-filters/filterFields";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { browserTimeZone } from "@/lib/browserTimeZone";
import { trpc } from "@/lib/trpc-client";
import { BoardEmpty } from "./BoardEmpty";
import { BoardHeader } from "./BoardHeader";
import { BoardStages } from "./BoardStages";
import { boardAnnouncements } from "./boardAnnouncements";
import { boardEmptyKind } from "./boardEmptyKind";
import type { BoardProps } from "./boardTypes";
import { isBoardFiltered } from "./boardView";
import { DealCard } from "./DealCard";
import { DragDropZones, zoneTransition } from "./DragDropZones";
import { resolveNeighbors } from "./dragNeighbors";
import { MoveDealDialog } from "./MoveDealDialog";
import { NewDealButton } from "./NewDealButton";
import { useBoardDerived } from "./useBoardDerived";
import { useBoardRealtime } from "./useBoardRealtime";
import { useBoardView } from "./useBoardView";
import { useDealClose } from "./useDealClose";
import { BOARD_QUERY_KEY, useDealMove } from "./useDealMove";

export type { BoardProps } from "./boardTypes";

export function Board(props: BoardProps): React.ReactNode {
  const { pipelineId, selfActorId, stages, cards, pipelines, density, baseCurrency } = props;
  const { serverNow } = props;
  const { move } = useDealMove(pipelineId);
  const { close } = useDealClose(pipelineId);
  useBoardRealtime(pipelineId, selfActorId);
  const utils = trpc.useUtils();
  const resolveLabels = useLabelColorResolver("deal");
  const view = useBoardView(props.initialView);
  const { ownerId: selectedOwnerId, savedFilter, conditions: inlineDefinition } = view;
  const { sortKey, sortDir: sortDirection } = view;
  const [previewDefinition, setPreviewDefinition] = useState<FilterDefinition | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moveDealId, setMoveDealId] = useState<string | null>(null);

  const activeDefinition = previewDefinition ?? inlineDefinition ?? savedFilter?.definition;
  const boardQuery = useQuery({
    queryKey: BOARD_QUERY_KEY(pipelineId),
    queryFn: () =>
      utils.client.deal.board.query({
        pipelineId,
        definition: activeDefinition,
        timeZone: browserTimeZone(),
      }),
    initialData: { cards },
    initialDataUpdatedAt: hasDateCondition(activeDefinition) ? 0 : undefined,
    refetchOnMount: view.restored ? "always" : true,
    staleTime: 5_000,
  });
  const liveCards = boardQuery.data.cards;
  const refetch = boardQuery.refetch;
  const filterMounted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: savedFilter/previewDefinition are intentional refetch triggers
  useEffect(() => {
    if (!filterMounted.current) {
      filterMounted.current = true;
      return;
    }
    void refetch();
  }, [savedFilter, previewDefinition, inlineDefinition, refetch]);

  const { owners, shownCards, sumsByStage, boardTotal, sortedByStage } = useBoardDerived({
    liveCards,
    stages,
    selectedOwnerId,
    conditions: [],
    sortKey,
    sortDirection,
  });

  const [now, setNow] = useState<Date>(serverNow);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(new Date()), []);

  const cardTitleById = useMemo(() => new Map(liveCards.map((c) => [c.id, c.title])), [liveCards]);
  const stageNameById = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);
  const cardUpdatedAt = useMemo(
    () => Object.fromEntries(liveCards.map((c) => [c.id, c.updatedAt.toISOString()])),
    [liveCards],
  );
  const addDeal = (
    <NewDealButton pipelineId={pipelineId} pipelines={pipelines} baseCurrency={baseCurrency} />
  );
  const filtered = isBoardFiltered(view);
  const emptyKind = boardEmptyKind({
    shownCount: shownCards.length,
    liveCount: liveCards.length,
    filtered,
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: defaultKeyboardCoordinateGetter }),
  );

  const liveRef = useRef<HTMLDivElement>(null);

  function onDragStart(e: DragStartEvent): void {
    const dealId = String(e.active.id);
    const stageFrom = liveCards.find((card) => card.id === dealId)?.stageId ?? "";
    capture(EVENTS.boardDragStarted, { route: currentRoute(), stageFrom });
    setDragActive(true);
    setActiveId(dealId);
  }

  const activeCard = activeId !== null ? liveCards.find((c) => c.id === activeId) : undefined;

  function moveToStage(dealId: string, toStageId: string): void {
    const destCards = liveCards.filter((c) => c.stageId === toStageId && c.id !== dealId);
    const { beforePosition, afterPosition } = resolveNeighbors(destCards, destCards.length);
    const expectedUpdatedAt = cardUpdatedAt[dealId];
    if (expectedUpdatedAt === undefined) return;
    move({ dealId, toStageId, beforePosition, afterPosition, expectedUpdatedAt });
  }

  function onDragEnd(e: DragEndEvent): void {
    setDragActive(false);
    setActiveId(null);
    const dealId = String(e.active.id);
    const toStageId = e.over !== null ? String(e.over.id) : null;
    const stageFrom = liveCards.find((card) => card.id === dealId)?.stageId ?? "";
    const stageTo = toStageId ?? "";
    capture(EVENTS.boardDragEnded, { route: currentRoute(), stageFrom, stageTo });
    if (toStageId === null) return;
    if (toStageId.startsWith("deal-zone-")) {
      if (toStageId === "deal-zone-move") {
        setMoveDealId(dealId);
        return;
      }
      const status = zoneTransition(
        toStageId,
        liveCards.find((card) => card.id === dealId)?.status,
      );
      const zoneUpdatedAt = cardUpdatedAt[dealId];
      if (status !== null && zoneUpdatedAt !== undefined) {
        close({ dealId, status, expectedUpdatedAt: zoneUpdatedAt });
      }
      return;
    }

    moveToStage(dealId, toStageId);
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={liveRef} aria-live="assertive" aria-atomic="true" className="sr-only" />

      <BoardHeader
        pipelineId={pipelineId}
        pipelines={pipelines}
        stages={stages}
        selfActorId={selfActorId}
        owners={owners}
        totalValue={String(boardTotal)}
        dealCount={shownCards.length}
        currency={baseCurrency}
        view={view}
        addSlot={addDeal}
        onPreviewFilter={setPreviewDefinition}
        canManagePipelines={props.canManagePipelines}
      />

      <DndContext
        id={`board-${pipelineId}`}
        sensors={sensors}
        onDragStart={onDragStart}
        onDragCancel={() => {
          capture(EVENTS.boardDragCancelled, { route: currentRoute() });
          setDragActive(false);
          setActiveId(null);
        }}
        onDragEnd={onDragEnd}
        accessibility={{ announcements: boardAnnouncements(cardTitleById, stageNameById) }}
      >
        {emptyKind !== "none" && (
          <BoardEmpty kind={emptyKind} onClearFilters={view.clearFilters} addSlot={addDeal} />
        )}
        {emptyKind !== "filtered" && (
          <BoardStages
            stages={stages}
            sumsByStage={sumsByStage}
            sortedByStage={sortedByStage}
            density={density}
            now={now}
            pipelineId={pipelineId}
            pipelines={pipelines}
            baseCurrency={baseCurrency}
          />
        )}

        <DragDropZones active={dragActive} />

        <DragOverlay>
          {activeCard !== undefined ? (
            <DealCard
              card={activeCard}
              ownerName={activeCard.ownerName ?? "?"}
              personName={activeCard.personName ?? null}
              orgName={activeCard.orgName ?? null}
              labels={resolveLabels(activeCard.labels)}
              rottingDays={null}
              density={density}
              now={now}
              currency={baseCurrency}
              elevated
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {moveDealId !== null && (
        <MoveDealDialog
          stages={stages.map((s) => ({ id: s.id, name: s.name }))}
          onPick={(stageId) => {
            moveToStage(moveDealId, stageId);
            setMoveDealId(null);
          }}
          onClose={() => setMoveDealId(null)}
        />
      )}
    </div>
  );
}
