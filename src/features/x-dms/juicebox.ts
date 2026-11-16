import { ChatXdkError, createChat } from "@xdevplatform/chat-xdk-server";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";

export interface ChatKeyUnlocker {
  unlock(
    a: { accountId: string; juiceboxConfig: unknown; passcode: string },
    s: AbortSignal,
  ): Promise<Result<Uint8Array, AppError>>;
}

const juiceboxConfigSchema = z
  .object({
    token_map: z.array(
      z.object({
        key: z.union([z.string(), z.number()]),
        value: z.object({ token: z.string() }).nullish(),
      }),
    ),
  })
  .loose();

const failed = (accountId: string, reason: string): AppError =>
  new AppError(ERROR_IDS.X_UNLOCK_FAILED, "x chat key unlock failed", { accountId, reason });

export function mapFailure(accountId: string, cause: unknown): AppError {
  if (cause instanceof ChatXdkError) {
    if (cause.kind === "invalidPin") {
      return new AppError(ERROR_IDS.X_PASSCODE_WRONG, "x chat passcode is wrong", {
        accountId,
        guessesRemaining: cause.guessesRemaining,
      });
    }
    return failed(accountId, cause.kind);
  }
  return failed(accountId, cause instanceof Error ? cause.constructor.name : "non_error");
}

let tail: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function stopped(accountId: string, signal: AbortSignal): Result<never, AppError> {
  const reason: unknown = signal.reason;
  if (reason instanceof DOMException && reason.name === "TimeoutError")
    return err(failed(accountId, "timeout"));
  throw reason;
}

function stopIfAborted(accountId: string, signal: AbortSignal): Result<never, AppError> | null {
  return signal.aborted ? stopped(accountId, signal) : null;
}

function abortOf(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fire = () => {
      reject(signal.reason as Error);
    };
    if (signal.aborted) fire();
    else signal.addEventListener("abort", fire, { once: true });
  });
}

async function recover(
  a: { accountId: string; passcode: string },
  config: z.infer<typeof juiceboxConfigSchema>,
  signal: AbortSignal,
): Promise<Result<Uint8Array, AppError>> {
  const before = stopIfAborted(a.accountId, signal);
  if (before !== null) return before;
  const realm = new Map(
    config.token_map.map((e) => [String(e.key).toLowerCase(), e.value?.token ?? ""]),
  );
  const chat = await createChat({
    juiceboxConfig: JSON.stringify(config),
    getAuthToken: (id: string) => Promise.resolve(realm.get(String(id).toLowerCase()) ?? ""),
  });
  try {
    await chat.unlock(a.passcode);
    return stopIfAborted(a.accountId, signal) ?? ok(chat.exportKeys());
  } finally {
    chat.free();
  }
}

export const juiceboxUnlocker: ChatKeyUnlocker = {
  async unlock(a, signal) {
    const parsed = juiceboxConfigSchema.safeParse(a.juiceboxConfig);
    if (!parsed.success) return err(failed(a.accountId, "config_invalid"));
    const work = serialized(() => recover(a, parsed.data, signal));
    try {
      return await Promise.race([work, abortOf(signal)]);
    } catch (cause) {
      if (signal.aborted) return stopped(a.accountId, signal);
      return err(mapFailure(a.accountId, cause));
    }
  },
};
