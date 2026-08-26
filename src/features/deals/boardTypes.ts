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
  // Pipelines carry their stages so the Add deal modal can offer a pipeline select + stage chevron.
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
  density: "comfortable" | "compact";
  baseCurrency?: string;
  // Toolbar view restored from user_preferences.ui.boardView (server-read); absent means defaults.
  initialView?: BoardViewState;
  // Request timestamp, so rot tint and activity state are right in the server render. Without it
  // the first paint claims every deal has nothing scheduled until a mount effect supplies a clock,
  // which is a wrong answer rather than an absent one.
  serverNow: Date;
}
