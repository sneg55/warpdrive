"use client";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useLabelColorResolver } from "@/features/labels/useLabelColorResolver";
import { formatCurrency } from "@/lib/formatCurrency";
import { accentForOrder, funnelClip, tint } from "./boardStageHeader";
import { DealCard } from "./DealCard";
import type { BoardCard } from "./dealRepo";
import { StageAddButton } from "./StageAddButton";
import { StageColumnMenu } from "./StageColumnMenu";

interface DraggableCardProps {
  card: BoardCard;
  rottingDays: number | null;
  density: "comfortable" | "compact";
  now: Date | null;
}

function DraggableCard(props: DraggableCardProps): React.ReactNode {
  const { card, rottingDays, density, now } = props;
  const router = useRouter();
  const resolveLabels = useLabelColorResolver("deal");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { stageId: card.stageId, boardPosition: card.boardPosition },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : undefined }}
    >
      <DealCard
        card={card}
        ownerName={card.ownerName ?? "?"}
        ownerAvatarUrl={card.ownerAvatarUrl}
        personName={card.personName ?? null}
        orgName={card.orgName ?? null}
        labels={resolveLabels(card.labels)}
        rottingDays={rottingDays}
        density={density}
        now={now}
        onOpen={() => router.push(`/deals/${card.id}`)}
      />
    </div>
  );
}

export interface BoardColumnProps {
  stageId: string;
  stageName: string;
  order: number;
  rottingDays: number | null;
  cards: BoardCard[];
  dealCount: number;
  totalValue: string;
  density: "comfortable" | "compact";
  // null until the client clock is set (see Board). Threads down to each DealCard's time visuals.
  now: Date | null;
  // For the per-stage add-deal button (opens the modal preset to this stage).
  pipelineId: string;
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
  baseCurrency?: string;
}

export function BoardColumn(props: BoardColumnProps): React.ReactNode {
  const { stageId, stageName, order, rottingDays, cards, dealCount, totalValue, density, now } =
    props;
  const { pipelineId, pipelines, baseCurrency } = props;
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  const accent = accentForOrder(order);
  // P1: local collapse state, toggled from the per-column actions menu. Session-only (no persist):
  // a rep collapses a stage to focus the board for the current session, not as a durable preference.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section
      ref={setNodeRef}
      aria-roledescription="stage column"
      aria-label={stageName}
      className={[
        // Pipedrive-style lane: a tall, subtly filled column so every stage (even empty ones)
        // reads as a drop lane rather than barren white space. isOver swaps to the accent tint.
        // flex-1 + min-w lets a few stages fill the board width while many stages scroll.
        // Concentric radius: lane is rounded-xl so its 8px padding + rounded-lg cards nest cleanly
        // (outer radius > inner radius) instead of the equal-radius look that reads as "off".
        "flex min-w-72 flex-1 flex-col gap-2 rounded-xl p-2 transition-colors",
        // Collapsed lanes shrink to just their header (no tall empty drop zone); expanded lanes
        // keep the min-height so even empty stages read as a drop target.
        collapsed ? "" : "min-h-96",
        isOver ? "bg-accent/60 ring-2 ring-ring/40" : "bg-muted/40",
      ]
        .join(" ")
        .trim()}
    >
      <header className="relative">
        {/* P1: per-column actions menu, top-right of the header (Pipedrive reveals it on hover). */}
        <div className="absolute right-1 top-0.5 z-10">
          <StageColumnMenu
            pipelineId={pipelineId}
            stageId={stageId}
            stageName={stageName}
            pipelines={pipelines}
            baseCurrency={baseCurrency}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((v) => !v)}
          />
        </div>
        {/* Pipedrive-style funnel: a tinted arrow segment per stage. P4: 16px stage headings
            (text-base) to match Pipedrive's board hierarchy; keep the colored funnel chip. */}
        <div
          className="px-3 py-1.5 text-base font-semibold text-foreground"
          style={{
            clipPath: funnelClip(order === 0),
            backgroundColor: tint(accent, 0.18),
            borderLeft: order === 0 ? `3px solid ${accent}` : undefined,
          }}
        >
          {stageName}
        </div>
        <div className="mt-1 flex items-center gap-1 px-1 text-xs text-muted-foreground">
          {/* Balance/scale glyph before the value line (Pipedrive convention). */}
          <svg
            data-stage-metric-icon
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v18M7 7h10M5 7l-3 6a3 3 0 0 0 6 0L5 7zm14 0l-3 6a3 3 0 0 0 6 0l-3-6zM8 21h8" />
          </svg>
          <span className="tabular-nums">
            {formatCurrency(totalValue)}
            {dealCount > 0 ? (
              <>
                &nbsp;&middot;&nbsp; {dealCount} {dealCount === 1 ? "deal" : "deals"}
              </>
            ) : null}
          </span>
        </div>
      </header>

      {!collapsed && (
        <>
          <ul className="flex flex-col gap-2" aria-label={`${stageName} deals`}>
            {cards.map((card) => (
              <li key={card.id}>
                <DraggableCard card={card} rottingDays={rottingDays} density={density} now={now} />
              </li>
            ))}
          </ul>

          <StageAddButton
            pipelineId={pipelineId}
            stageId={stageId}
            pipelines={pipelines}
            baseCurrency={baseCurrency}
          />
        </>
      )}
    </section>
  );
}
