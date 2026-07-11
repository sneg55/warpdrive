import { redirect } from "next/navigation";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { CreatePipelineButton } from "@/features/pipelines/CreatePipelineButton";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

export const metadata = { title: STRINGS.nav.pipeline };

// The primary nav links to /pipeline, but a board is always scoped to a specific
// pipeline (/pipeline/[id]). Land the section root on the user's first visible
// pipeline so the nav item never 404s.
export default async function PipelineIndexPage(): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }
  const caller = createCaller(ctx);
  const pipelines = await caller.pipeline.list();
  const first = pipelines[0];
  if (first === undefined) {
    // A manager with no visible pipelines gets a create CTA (fresh install / no default seeded);
    // a non-manager genuinely has nothing to act on, so keep the plain message.
    const canManage =
      ctx.actor.type === "admin" || ctx.actor.flags.has(PERMISSION_FLAGS.PIPELINE_MANAGE);
    return (
      <main aria-label="Pipeline" className="grid h-full place-items-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{STRINGS.settings.noPipelinesYet}</p>
          {canManage && (
            <CreatePipelineButton label={STRINGS.settings.createFirstPipeline} onCreated="board" />
          )}
        </div>
      </main>
    );
  }
  redirect(`/pipeline/${first.id}`);
}
