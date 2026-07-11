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
  // Pipelines carry their stages so the Add deal modal can offer a pipeline select + stage chevron.
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
  density: "comfortable" | "compact";
  baseCurrency?: string;
}
