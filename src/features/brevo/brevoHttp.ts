import {
  BREVO_API_KEY_HEADER,
  BREVO_BACKOFF_BASE_MS,
  BREVO_BACKOFF_MAX_MS,
  BREVO_MAX_RATE_LIMIT_RETRIES,
  BREVO_NOT_FOUND_CODE,
  BREVO_RATE_LIMIT_RESET_HEADER,
  BREVO_REQUEST_TIMEOUT_MS,
  BREVO_REQUESTS_PER_SECOND,
} from "@/constants/brevo";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import type { BrevoHttp, BrevoHttpConfig, BrevoHttpOutcome } from "./types";

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_NOT_FOUND = 404;
const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVER_ERROR_FLOOR = 500;
const MS_PER_SECOND = 1000;

interface ErrorBody {
  code?: unknown;
  message?: unknown;
}

function makeLimiter(cfg: BrevoHttpConfig): (signal: AbortSignal) => Promise<void> {
  const spacingMs = MS_PER_SECOND / (cfg.requestsPerSecond ?? BREVO_REQUESTS_PER_SECOND);
  let nextSlotMs = 0;
  return async (signal) => {
    signal.throwIfAborted();
    const slot = Math.max(cfg.nowMs(), nextSlotMs);
    nextSlotMs = slot + spacingMs;
    const wait = slot - cfg.nowMs();
    if (wait > 0) await cfg.sleep(wait, signal);
  };
}

function backoffMs(res: Response, attempt: number): number {
  const resetSeconds = Number(res.headers.get(BREVO_RATE_LIMIT_RESET_HEADER));
  if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
    return Math.min(
      Math.max(resetSeconds * MS_PER_SECOND, BREVO_BACKOFF_BASE_MS),
      BREVO_BACKOFF_MAX_MS,
    );
  }
  return Math.min(BREVO_BACKOFF_BASE_MS * 2 ** attempt, BREVO_BACKOFF_MAX_MS);
}

async function readErrorBody(res: Response, runSignal: AbortSignal): Promise<ErrorBody> {
  try {
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null ? body : {};
  } catch {
    runSignal.throwIfAborted();
    return {};
  }
}

function messageOf(body: ErrorBody): string {
  return typeof body.message === "string" ? body.message : "";
}

async function classify(
  res: Response,
  path: string,
  attempt: number,
  runSignal: AbortSignal,
): Promise<Result<BrevoHttpOutcome, AppError> | { retry: number }> {
  if (res.status === HTTP_TOO_MANY_REQUESTS) return { retry: backoffMs(res, attempt) };
  if (res.ok) return ok({ kind: "ok", json: undefined });
  const body = await readErrorBody(res, runSignal);
  if (res.status === HTTP_UNAUTHORIZED) {
    return err(
      new AppError(
        ERROR_IDS.BREVO_UNAUTHORIZED,
        `brevo rejected the credentials: ${messageOf(body)}`,
        {
          path,
          status: res.status,
        },
      ),
    );
  }
  if (res.status === HTTP_NOT_FOUND && body.code === BREVO_NOT_FOUND_CODE) {
    return ok({ kind: "notFound" });
  }
  return err(
    new AppError(ERROR_IDS.BREVO_HTTP_FAILED, "brevo request failed", {
      path,
      status: res.status,
      transient: res.status >= HTTP_SERVER_ERROR_FLOOR,
    }),
  );
}

export function isTransientBrevoError(e: AppError): boolean {
  if (e.id === ERROR_IDS.BREVO_RATE_LIMITED || e.id === ERROR_IDS.BREVO_NETWORK_FAILED) return true;
  return e.id === ERROR_IDS.BREVO_HTTP_FAILED && e.context?.transient === true;
}

export function makeBrevoHttp(cfg: BrevoHttpConfig): BrevoHttp {
  const acquire = makeLimiter(cfg);
  const timeoutMs = cfg.requestTimeoutMs ?? BREVO_REQUEST_TIMEOUT_MS;

  async function attemptOnce(
    path: string,
    runSignal: AbortSignal,
    attempt: number,
  ): Promise<Result<BrevoHttpOutcome, AppError> | { retry: number }> {
    await acquire(runSignal);
    const requestSignal = AbortSignal.any([runSignal, AbortSignal.timeout(timeoutMs)]);
    const failed = (
      cause: unknown,
      id: typeof ERROR_IDS.BREVO_NETWORK_FAILED | typeof ERROR_IDS.BREVO_PARSE_FAILED,
    ) => {
      runSignal.throwIfAborted();
      const timedOut = requestSignal.aborted;
      return err(
        new AppError(
          timedOut ? ERROR_IDS.BREVO_NETWORK_FAILED : id,
          timedOut ? "brevo request timed out" : "brevo request did not complete",
          { path, cause: cause instanceof Error ? cause.message : String(cause) },
        ),
      );
    };
    let res: Response;
    try {
      res = await cfg.fetch(`${cfg.baseUrl}${path}`, {
        method: "GET",
        headers: { [BREVO_API_KEY_HEADER]: cfg.apiKey, Accept: "application/json" },
        signal: requestSignal,
      });
    } catch (e) {
      return failed(e, ERROR_IDS.BREVO_NETWORK_FAILED);
    }
    const verdict = await classify(res, path, attempt, runSignal);
    if ("retry" in verdict || !verdict.ok || verdict.value.kind !== "ok") return verdict;
    try {
      const json: unknown = await res.json();
      return ok({ kind: "ok", json });
    } catch (e) {
      return failed(e, ERROR_IDS.BREVO_PARSE_FAILED);
    }
  }

  return async (path, signal) => {
    for (let attempt = 0; attempt <= BREVO_MAX_RATE_LIMIT_RETRIES; attempt += 1) {
      const outcome = await attemptOnce(path, signal, attempt);
      if (!("retry" in outcome)) return outcome;
      if (attempt < BREVO_MAX_RATE_LIMIT_RETRIES) await cfg.sleep(outcome.retry, signal);
    }
    return err(
      new AppError(ERROR_IDS.BREVO_RATE_LIMITED, "brevo rate limit retries exhausted", {
        path,
        attempts: BREVO_MAX_RATE_LIMIT_RETRIES + 1,
      }),
    );
  };
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
