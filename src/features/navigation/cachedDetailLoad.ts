import { cache } from "react";
import { createContext } from "@/server/trpc/context";
import type { Result } from "@/types/result";

type Ctx = Awaited<ReturnType<typeof createContext>>;
type Actor = NonNullable<Ctx["actor"]>;

export type Loaded<T> =
  | { kind: "unauth" }
  | { kind: "notfound" }
  | { kind: "ok"; ctx: Ctx; actor: Actor; value: T };

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
