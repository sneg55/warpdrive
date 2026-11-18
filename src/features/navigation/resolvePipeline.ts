import { notFound } from "next/navigation";

export function resolveVisiblePipeline<T extends { id: string }>(
  pipelines: readonly T[],
  id: string,
): T {
  const pipeline = pipelines.find((p) => p.id === id);
  if (pipeline === undefined) {
    notFound();
  }
  return pipeline;
}
