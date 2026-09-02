import type { DealListCard } from "./dealRepo";

export interface DealListStage {
  id: string;
  name: string;
}

export interface DealListRow extends Omit<DealListCard, "updatedAt"> {
  updatedAt: string;
}
