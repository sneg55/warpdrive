import { redirect } from "next/navigation";
import { timed, timingRoute } from "@/features/observability/serverTiming";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

export default async function Home(): Promise<never> {
  await timingRoute("/");
  const ctx = await timed("root.session", () => createContext());
  if (ctx.actor === null) redirect("/login");
  const [first] = await timed("root.pipelines", () => createCaller(ctx).pipeline.list());
  redirect(first === undefined ? "/pipeline" : `/pipeline/${first.id}`);
}
