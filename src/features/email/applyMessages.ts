import type { AppError } from "@/constants/errorIds";
import { ok, type Result } from "@/types/result";
import { type ApplyArgs, applyOne, loadApplyContext, notifyArrivals } from "./applyCore";
import type { ParsedMessage } from "./mimeParse";
import type { MailProvider } from "./provider/types";

export type { ApplyArgs } from "./applyCore";

export async function applyMessageIds(
  args: ApplyArgs & { provider: MailProvider },
  ids: string[],
): Promise<Result<number, AppError>> {
  args.signal.throwIfAborted();
  const ctx = await loadApplyContext(args);
  if (ctx === null) return ok(0);
  let applied = 0;
  for (const id of ids) {
    const fetched = await args.provider.fetchParsed({ id, signal: args.signal });
    if (!fetched.ok) return fetched;
    if (fetched.value === null) continue;
    if (await applyOne(args, ctx, fetched.value)) applied += 1;
  }
  await notifyArrivals(args.db, ctx.arrivals, args.signal);
  return ok(applied);
}

export async function applyParsedMessages(
  args: ApplyArgs,
  messages: ParsedMessage[],
): Promise<Result<number, AppError>> {
  args.signal.throwIfAborted();
  const ctx = await loadApplyContext(args);
  if (ctx === null) return ok(0);
  let applied = 0;
  for (const parsed of messages) {
    if (await applyOne(args, ctx, parsed)) applied += 1;
  }
  await notifyArrivals(args.db, ctx.arrivals, args.signal);
  return ok(applied);
}
