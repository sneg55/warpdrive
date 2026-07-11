import { cache } from "react";
import { createContext } from "@/server/trpc/context";
import type { Result } from "@/types/result";

type Ctx = Awaited<ReturnType<typeof createContext>>;
type Actor = NonNullable<Ctx["actor"]>;

// The outcome a detail route acts on: not signed in, record not visible/missing, or the loaded
// value plus the request ctx/actor the page needs for follow-up reads (defs, related names,
// permission checks).
export type Loaded<T> =
  | { kind: "unauth" }
  | { kind: "notfound" }
  | { kind: "ok"; ctx: Ctx; actor: Actor; value: T };

/**
 * Build a per-request loader for a detail route (deal/person/org, etc.). The returned function is
 * wrapped in React.cache, so calling it from both generateMetadata and the page component runs the
 * fetch once. It also collapses the auth guard (null actor to unauth) and the Result unwrap
 * (err to notfound) that every detail route repeats. `fetch` receives the authenticated ctx and
 * actor and returns a Result.
 */
export function cachedDetailLoad<T, E>(
  fetch: (ctx: Ctx, actor: Actor, id: string) => Promise<Result<T, E>>,
): (id: string) => Promise<Loaded<T>> {
  return cache(async (id: string): Promise<Loaded<T>> => {
    const ctx = await createContext();
    if (ctx.actor === null) {
      return { kind: "unauth" };
    }
    const result = await fetch(ctx, ctx.actor, id);
    if (result.ok === false) {
      return { kind: "notfound" };
    }
    return { kind: "ok", ctx, actor: ctx.actor, value: result.value };
  });
}
