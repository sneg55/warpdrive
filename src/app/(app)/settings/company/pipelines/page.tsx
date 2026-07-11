import Link from "next/link";
import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { CreatePipelineButton } from "@/features/pipelines/CreatePipelineButton";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

export const metadata = { title: STRINGS.settings.pipelines };

// Company settings > Pipelines tab: list pipelines, create new ones, link to the stage editor.
// Gated on admin or the pipeline.manage flag (same capability createPipeline enforces server-side).
export default async function PipelinesSettingsPage(): Promise<ReactNode> {
  const ctx = await createContext();
  const { actor } = ctx;
  if (
    actor === null ||
    (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.PIPELINE_MANAGE))
  ) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAdmin}</p>;
  }

  const caller = createCaller(ctx);
  const pipelines = await caller.pipeline.list();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{STRINGS.settings.pipelinesDescription}</p>
        <CreatePipelineButton label={STRINGS.settings.createPipeline} onCreated="edit" />
      </div>
      {pipelines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{STRINGS.settings.noPipelinesYet}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {pipelines.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-3 py-2.5">
              <div>
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.stages.length} {p.stages.length === 1 ? "stage" : "stages"}
                </div>
              </div>
              <Link
                href={`/pipeline/${p.id}/edit`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {STRINGS.settings.editStages}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
