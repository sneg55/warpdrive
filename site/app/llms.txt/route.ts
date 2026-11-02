import { buildLlmsTxt } from "@/features/llms/buildLlmsTxt";
import { getBuildRepoFacts } from "@/features/release/buildRepoFacts";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const facts = await getBuildRepoFacts();
  return new Response(buildLlmsTxt(facts.release), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
