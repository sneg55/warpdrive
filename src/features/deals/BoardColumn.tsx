"use client";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useLabelColorResolver } from "@/features/labels/useLabelColorResolver";
import { formatCurrency } from "@/lib/formatCurrency";
import { stageSubtitle } from "./boardColumnSubtitle";
import { accentForOrder, funnelClip, tint } from "./boardStageHeader";
import { DealCard } from "./DealCard";
import type { BoardCard } from "./dealRepo";
import { StageAddButton } from "./StageAddButton";
import { StageColumnMenu } from "./StageColumnMenu";

interface DraggableCardProps {
  card: BoardCard;
  rottingDays: number | null;
  density: "comfortable" | "compact";
  now: Date;
  currency: string;
}

function DraggableCard(props: DraggableCardProps): React.ReactNode {
  const { card, rottingDays, density, now, currency } = props;
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
        currency={currency}
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
  now: Date;
  pipelineId: string;
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
  baseCurrency: string;
}

export function BoardColumn(props: BoardColumnProps): React.ReactNode {
  const { stageId, stageName, order, rottingDays, cards, dealCount, totalValue, density, now } =
    props;
  const { pipelineId, pipelines, baseCurrency } = props;
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  const accent = accentForOrder(order);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section
      ref={setNodeRef}
      aria-roledescription="stage column"
      aria-label={stageName}
      className={[
        "flex min-w-72 flex-1 flex-col gap-2 overflow-hidden rounded-xl p-2 transition-colors",
        collapsed ? "" : "min-h-96",
        isOver ? "bg-accent/60 ring-2 ring-ring/40" : "bg-muted/40",
      ]
        .join(" ")
        .trim()}
    >
      <header className="relative">
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
          <Scale data-stage-metric-icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="tabular-nums">
            {stageSubtitle(formatCurrency(totalValue, baseCurrency), dealCount)}
          </span>
        </div>
      </header>

      {!collapsed && (
        <>
          <ul
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
            aria-label={`${stageName} deals`}
          >
            {cards.map((card) => (
              <li
                key={card.id}
                className="[content-visibility:auto] [contain-intrinsic-size:auto_96px]"
              >
                <DraggableCard
                  card={card}
                  rottingDays={rottingDays}
                  density={density}
                  now={now}
                  currency={baseCurrency}
                />
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
