import { calendarDaysBetween } from "@/lib/calendarDays";

type StageRow = { id: string; name: string; order: number; rottingDays: number | null };
type DealLike = { stageId: string; stageEnteredAt: Date };

export type StageChip = {
  id: string;
  name: string;
  current: boolean;
  passed: boolean;
  // Days spent in this stage. Option B (no stage-transition history yet): real for the current
  // stage, 0 for others. Accurate per-stage durations become available once moves are logged.
  days: number;
};

export type StageProgress = {
  chips: StageChip[];
  daysInStage: number;
  rotting: boolean;
};

export function timeInStageDays(stageEnteredAt: Date, now: Date = new Date()): number {
  return Math.max(0, calendarDaysBetween(stageEnteredAt, now));
}

export function buildStageProgress(
  deal: DealLike,
  stages: StageRow[],
  now: Date = new Date(),
): StageProgress {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const currentIndex = ordered.findIndex((s) => s.id === deal.stageId);
  const daysInStage = timeInStageDays(deal.stageEnteredAt, now);
  const threshold = ordered[currentIndex]?.rottingDays ?? null;
  return {
    chips: ordered.map((s, i) => ({
      id: s.id,
      name: s.name,
      current: i === currentIndex,
      passed: i < currentIndex,
      days: i === currentIndex ? daysInStage : 0,
    })),
    daysInStage,
    rotting: threshold !== null && daysInStage > threshold,
  };
}
