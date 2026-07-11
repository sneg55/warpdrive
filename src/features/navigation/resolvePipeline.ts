import { notFound } from "next/navigation";

// Resolve the pipeline a route param points at, or 404 like the entity detail routes do
// (NAVIGATION-03). pipeline.list only returns pipelines the actor may see, so "not in the
// visible list" covers both "does not exist" and "exists but hidden"; calling notFound() for
// both keeps them indistinguishable and leaks no signal that a hidden pipeline exists.
// notFound() throws (returns never), so the return type is the resolved pipeline.
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
