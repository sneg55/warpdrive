import { STRINGS } from "@/constants/strings";
import { EditPipelineClient } from "@/features/pipelines/EditPipelineClient";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

export const metadata = { title: STRINGS.titles.editPipeline };

export default async function EditPipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  const ctx = await createContext();
  if (ctx.actor === null) {
    return <main>Unauthorized</main>;
  }
  const caller = createCaller(ctx);
  const pipeline = await caller.pipeline.byId(id);
  if (pipeline === null) {
    return <main>Pipeline not found</main>;
  }

  return (
    <main aria-label={`Edit pipeline ${pipeline.name}`} className="h-full">
      <h1 className="mb-4 text-lg font-semibold">Edit pipeline</h1>
      <EditPipelineClient
        pipelineId={pipeline.id}
        pipelineName={pipeline.name}
        stages={pipeline.stages.map((s) => ({
          id: s.id,
          name: s.name,
          rottingDays: s.rottingDays,
        }))}
      />
    </main>
  );
}
