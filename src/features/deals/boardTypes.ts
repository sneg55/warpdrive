import type { BoardViewState } from "./boardView";
import type { BoardCard } from "./dealRepo";

export interface StageMeta {
  id: string;
  name: string;
  order: number;
  rottingDays: number | null;
}

export interface BoardProps {
  pipelineId: string;
  selfActorId: string;
  stages: StageMeta[];
  cards: BoardCard[];
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
  density: "comfortable" | "compact";
  baseCurrency?: string;
  initialView?: BoardViewState;
  serverNow: Date;
  canManagePipelines?: boolean;
}
