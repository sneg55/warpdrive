"use client";
import type React from "react";
import { BoardColumn } from "./BoardColumn";
import type { BoardProps } from "./boardTypes";
import type { BoardCard } from "./dealRepo";

type Stage = BoardProps["stages"][number];

interface BoardStagesProps {
  stages: Stage[];
  sumsByStage: Map<string, { dealCount: number; total: number }>;
  sortedByStage: Map<string, BoardCard[]>;
  density: BoardProps["density"];
  now: Date | null;
  pipelineId: string;
  pipelines: BoardProps["pipelines"];
  baseCurrency?: string;
}

// The horizontal list of stage columns. Extracted from Board so Board stays under the file-size
// cap; purely presentational (all board state is derived by the parent and passed in).
export function BoardStages({
  stages,
  sumsByStage,
  sortedByStage,
  density,
  now,
  pipelineId,
  pipelines,
  baseCurrency,
}: BoardStagesProps): React.ReactNode {
  return (
    <ul
      aria-label="Pipeline stages"
      className="flex min-h-0 flex-1 list-none gap-4 overflow-x-auto pb-4"
    >
      {stages.map((s) => {
        const stageSum = sumsByStage.get(s.id);
        return (
          // The <li> is the flex item: it must carry flex-1 + min-w so columns grow to fill
          // the board width. The inner section stretches to fill this item.
          <li key={s.id} className="flex min-w-72 flex-1">
            <BoardColumn
              stageId={s.id}
              stageName={s.name}
              order={s.order}
              rottingDays={s.rottingDays}
              cards={sortedByStage.get(s.id) ?? []}
              dealCount={stageSum?.dealCount ?? 0}
              totalValue={String(stageSum?.total ?? 0)}
              density={density}
              now={now}
              pipelineId={pipelineId}
              pipelines={pipelines}
              baseCurrency={baseCurrency}
            />
          </li>
        );
      })}
    </ul>
  );
}
