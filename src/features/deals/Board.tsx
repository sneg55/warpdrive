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
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { trpc } from "@/lib/trpc-client";
import { BoardEmpty } from "./BoardEmpty";
import { BoardHeader } from "./BoardHeader";
import { BoardStages } from "./BoardStages";
import { boardAnnouncements } from "./boardAnnouncements";
import { boardEmptyKind } from "./boardEmptyKind";
import type { BoardProps } from "./boardTypes";
import { isBoardFiltered } from "./boardView";
import { DealCard } from "./DealCard";
import { DragDropZones, zoneToStatus } from "./DragDropZones";
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
  // Toolbar view (owner filter, saved/ad-hoc filter, sort), seeded from the user's saved
  // preference and written back on every change.
  const view = useBoardView(props.initialView);
  const { ownerId: selectedOwnerId, savedFilter, conditions: inlineDefinition } = view;
  const { sortKey, sortDir: sortDirection } = view;
  // A not-yet-saved filter definition being previewed from the create-filter modal. When set it
  // overrides the saved filter for the board query, so the board shows the in-progress result
  // behind the modal; cleared (revert) when the modal closes. Transient by design: a preview
  // belongs to the open modal, so it is the one filter state that is never persisted.
  const [previewDefinition, setPreviewDefinition] = useState<FilterDefinition | null>(null);
  // Reveals the bottom action bar (Delete/Lost/Won/Move) only while a deal is being dragged.
  const [dragActive, setDragActive] = useState(false);
  // Id of the card currently under the pointer, rendered lifted in the DragOverlay.
  const [activeId, setActiveId] = useState<string | null>(null);
  // Deal id awaiting a Move stage pick (set when a card is dropped on the Move zone).
  const [moveDealId, setMoveDealId] = useState<string | null>(null);

  // Subscribe to the shared board cache so an optimistic move (useDealMove) or a realtime
  // event (useBoardRealtime) re-renders the board immediately, without a reload. Seeded from
  // the server-rendered cards; invalidation reconciles via the tRPC board query. This closes
  // the bug where a dropped card only appeared in its new column after an F5.
  const boardQuery = useQuery({
    queryKey: BOARD_QUERY_KEY(pipelineId),
    queryFn: () =>
      utils.client.deal.board.query({
        pipelineId,
        definition: previewDefinition ?? inlineDefinition ?? savedFilter?.definition,
      }),
    initialData: { cards },
    staleTime: 5_000,
  });
  const liveCards = boardQuery.data.cards;
  const refetch = boardQuery.refetch;
  // Re-run the (same-key) board query when the applied saved filter changes so filtering is
  // server-side while realtime patching + optimistic moves keep matching the single cache key.
  // Skip the first run: the query is already seeded with the SSR cards for the initial (null)
  // filter, so refetching on mount would be a redundant round trip that discards initialData.
  // savedFilter is a deliberate trigger dep (the queryFn closes over its definition), not used
  // in the body, so biome's exhaustive-deps check is suppressed here on purpose.
  const filterMounted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: savedFilter/previewDefinition are intentional refetch triggers
  useEffect(() => {
    if (!filterMounted.current) {
      filterMounted.current = true;
      return;
    }
    void refetch();
  }, [savedFilter, previewDefinition, inlineDefinition, refetch]);

  // All display derivations (owner + saved-filter + quick-condition narrowing, per-stage sums,
  // board total, per-column sorting) live in one hook. Drag math still reads raw liveCards.
  const { owners, shownCards, sumsByStage, boardTotal, sortedByStage } = useBoardDerived({
    liveCards,
    stages,
    selectedOwnerId,
    // Ad-hoc conditions now flow through the server-side filter definition (BoardFilterButton),
    // so there is no client-side quick-condition list to apply here.
    conditions: [],
    sortKey,
    sortDirection,
  });

  // Clock for time-derived visuals, seeded from the request so SSR and hydration agree on a real
  // timestamp. Reading `new Date()` during render would diverge between the two; starting from
  // null would make the first paint assert that nothing is scheduled and nothing is rotting.
  const [now, setNow] = useState<Date>(serverNow);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- hands the clock over to the browser after hydration so a long-lived tab does not keep reading the request time
  useEffect(() => setNow(new Date()), []);

  const cardTitleById = useMemo(() => new Map(liveCards.map((c) => [c.id, c.title])), [liveCards]);
  const stageNameById = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);
  const cardUpdatedAt = useMemo(
    () => Object.fromEntries(liveCards.map((c) => [c.id, c.updatedAt.toISOString()])),
    [liveCards],
  );
  // One add-deal control, shared by the toolbar and the empty-pipeline state.
  const addDeal = (
    <NewDealButton pipelineId={pipelineId} pipelines={pipelines} baseCurrency={baseCurrency} />
  );
  // A filter that excluded every card is a different sentence from an empty pipeline, and only the
  // first one replaces the stage columns: an empty pipeline keeps them as the drop targets they are.
  const filtered = isBoardFiltered(view);
  const emptyKind = boardEmptyKind({
    shownCount: shownCards.length,
    liveCount: liveCards.length,
    filtered,
  });
  const sensors = useSensors(
    // Require an 8px drag before a pointer gesture becomes a drag, so a plain click on a
    // card fires its onClick (open the deal) instead of starting a drag (Pipedrive parity).
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: defaultKeyboardCoordinateGetter }),
  );

  // aria-live region ref: dnd-kit injects announcements into its own region, but
  // we keep a ref for any supplemental app-level announcements if needed.
  const liveRef = useRef<HTMLDivElement>(null);

  function onDragStart(e: DragStartEvent): void {
    const dealId = String(e.active.id);
    const stageFrom = liveCards.find((card) => card.id === dealId)?.stageId ?? "";
    capture(EVENTS.boardDragStarted, { route: currentRoute(), stageFrom });
    setDragActive(true);
    setActiveId(dealId);
  }

  const activeCard = activeId !== null ? liveCards.find((c) => c.id === activeId) : undefined;

  // Move a deal to the end of a stage column via the CAS move mutation.
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
    // Dropping onto a bottom action zone is not a stage move. Won/Lost close the deal; Move opens a
    // stage picker; Delete is not a drag target (deletion is a confirmed menu action).
    if (toStageId.startsWith("deal-zone-")) {
      if (toStageId === "deal-zone-move") {
        setMoveDealId(dealId);
        return;
      }
      const status = zoneToStatus(toStageId);
      const zoneUpdatedAt = cardUpdatedAt[dealId];
      if (status !== null && zoneUpdatedAt !== undefined) {
        close({ dealId, status, expectedUpdatedAt: zoneUpdatedAt });
      }
      return;
    }

    moveToStage(dealId, toStageId);
  }

  return (
    // Full-height flex column so the stages list (and its lanes) fill the viewport height
    // instead of stopping at the cards' natural height.
    <div className="flex h-full flex-col">
      {/* Visually hidden aria-live region for supplemental board status messages (UI 9.1). */}
      <div ref={liveRef} aria-live="assertive" aria-atomic="true" className="sr-only" />

      <BoardHeader
        pipelineId={pipelineId}
        pipelines={pipelines}
        stages={stages}
        selfActorId={selfActorId}
        owners={owners}
        totalValue={String(boardTotal)}
        dealCount={shownCards.length}
        view={view}
        addSlot={addDeal}
        onPreviewFilter={setPreviewDefinition}
      />

      <DndContext
        // Stable, deterministic id so dnd-kit's accessibility ids (aria-describedby /
        // live-region) match between the server and client render. Without it dnd-kit
        // falls back to an internal counter that diverges under SSR and trips a React
        // hydration mismatch on the board.
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
        {/* Only a board proven to be hiding cards drops its columns: the other two states may be
            an empty pipeline, whose columns are still the drop targets. */}
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

        {/* Bottom Delete/Lost/Won/Move action bar, revealed only during a drag (Pipedrive). */}
        <DragDropZones active={dragActive} />

        {/* Lifted card that follows the pointer while dragging (Pipedrive floats the card and
            leaves a dimmed placeholder in the column, which preserves the lane's layout). */}
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
