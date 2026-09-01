import type { BoardCard } from "./dealRepo";

export interface DealListStage {
  id: string;
  name: string;
}

export interface DealListRow extends Omit<BoardCard, "updatedAt"> {
  updatedAt: string;
}
