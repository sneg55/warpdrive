import type { StageConversionRow, StageSum } from "@/types/stats";

function positionLabel(order: number): string {
  return `Stage ${order + 1}`;
}

function mergedName(names: Set<string>, order: number): string {
  const [only] = names;
  return names.size === 1 && only !== undefined ? only : positionLabel(order);
}

export function aggregateStageConversion(
  perPipeline: readonly StageConversionRow[][],
): StageConversionRow[] {
  const byOrder = new Map<
    number,
    { reached: number; names: Set<string>; dwell: (number | null)[] }
  >();
  for (const rows of perPipeline) {
    for (const r of rows) {
      const bucket = byOrder.get(r.order) ?? { reached: 0, names: new Set(), dwell: [] };
      bucket.reached += r.reached;
      bucket.names.add(r.name);
      bucket.dwell.push(r.medianDaysInStage);
      byOrder.set(r.order, bucket);
    }
  }

  const orders = [...byOrder.keys()].sort((a, b) => a - b);
  const first = orders[0];
  const base = first === undefined ? 0 : (byOrder.get(first)?.reached ?? 0);

  return orders.map((order) => {
    const bucket = byOrder.get(order);
    const reached = bucket?.reached ?? 0;
    const dwell = bucket?.dwell ?? [];
    return {
      stageId: positionLabel(order),
      name: mergedName(bucket?.names ?? new Set(), order),
      order,
      reached,
      conversion: base > 0 ? reached / base : 0,
      medianDaysInStage: dwell.length === 1 ? (dwell[0] ?? null) : null,
    };
  });
}

export function aggregateStageSums(perPipeline: readonly StageSum[][]): StageSum[] {
  const byOrder = new Map<number, { dealCount: number; total: number; names: Set<string> }>();
  for (const rows of perPipeline) {
    for (const r of rows) {
      const bucket = byOrder.get(r.order) ?? { dealCount: 0, total: 0, names: new Set() };
      bucket.dealCount += r.dealCount;
      bucket.total += Number(r.total);
      bucket.names.add(r.name);
      byOrder.set(r.order, bucket);
    }
  }

  return [...byOrder.keys()]
    .sort((a, b) => a - b)
    .map((order) => {
      const bucket = byOrder.get(order);
      return {
        stageId: positionLabel(order),
        name: mergedName(bucket?.names ?? new Set(), order),
        order,
        dealCount: bucket?.dealCount ?? 0,
        total: (bucket?.total ?? 0).toFixed(2),
      };
    });
}
