import { AppError, ERROR_IDS } from "@/constants/errorIds";
import {
  INTERCOM_API_VERSION,
  INTERCOM_BACKOFF_BASE_MS,
  INTERCOM_BACKOFF_MAX_MS,
  INTERCOM_MAX_RATE_LIMIT_RETRIES,
} from "@/constants/intercom";
import { err, ok, type Result } from "@/types/result";
import type { IntercomHttpConfig } from "./types";

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;
const HTTP_SERVER_ERROR_FLOOR = 500;
const RATE_LIMIT_RESET_HEADER = "X-RateLimit-Reset";

interface RequestSpec {
  method: "GET" | "POST";
  body?: unknown;
}

function backoffMs(res: Response, attempt: number, nowMs: number): number {
  const reset = Number(res.headers.get(RATE_LIMIT_RESET_HEADER));
  if (Number.isFinite(reset) && reset > 0) {
    const untilReset = reset * 1000 - nowMs;
    return Math.min(Math.max(untilReset, INTERCOM_BACKOFF_BASE_MS), INTERCOM_BACKOFF_MAX_MS);
  }
  return Math.min(INTERCOM_BACKOFF_BASE_MS * 2 ** attempt, INTERCOM_BACKOFF_MAX_MS);
}

function statusError(path: string, status: number): AppError {
  if (status === HTTP_NOT_FOUND || status === HTTP_GONE) {
    return new AppError(ERROR_IDS.INTERCOM_NOT_FOUND, "intercom resource not found", {
      path,
      status,
    });
  }
  return new AppError(ERROR_IDS.INTERCOM_HTTP_FAILED, "intercom request failed", {
    path,
    status,
    transient: status >= HTTP_SERVER_ERROR_FLOOR,
  });
}

export function isTransientIntercomError(e: AppError): boolean {
  if (e.id === ERROR_IDS.INTERCOM_RATE_LIMITED || e.id === ERROR_IDS.INTERCOM_NETWORK_FAILED) {
    return true;
  }
  return e.id === ERROR_IDS.INTERCOM_HTTP_FAILED && e.context?.transient === true;
}

async function sendOnce(
  cfg: IntercomHttpConfig,
  path: string,
  spec: RequestSpec,
  signal: AbortSignal,
): Promise<Result<Response, AppError>> {
  try {
    return ok(
      await cfg.fetch(`${cfg.baseUrl}${path}`, {
        method: spec.method,
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Intercom-Version": INTERCOM_API_VERSION,
        },
        body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
        signal,
      }),
    );
  } catch (e) {
    signal.throwIfAborted();
    return err(
      new AppError(ERROR_IDS.INTERCOM_NETWORK_FAILED, "intercom request did not complete", {
        path,
        cause: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

async function readJson(
  res: Response,
  path: string,
  signal: AbortSignal,
): Promise<Result<unknown, AppError>> {
  try {
    return ok(await res.json());
  } catch {
    signal.throwIfAborted();
    return err(
      new AppError(ERROR_IDS.INTERCOM_PARSE_FAILED, "intercom response was not json", { path }),
    );
  }
}

export async function intercomRequest(
  cfg: IntercomHttpConfig,
  path: string,
  spec: RequestSpec,
  signal: AbortSignal,
): Promise<Result<unknown, AppError>> {
  for (let attempt = 0; attempt <= INTERCOM_MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    signal.throwIfAborted();
    const sent = await sendOnce(cfg, path, spec, signal);
    if (!sent.ok) return sent;
    const res = sent.value;
    if (res.status !== HTTP_TOO_MANY_REQUESTS) {
      return res.ok ? readJson(res, path, signal) : err(statusError(path, res.status));
    }
    if (attempt < INTERCOM_MAX_RATE_LIMIT_RETRIES) {
      await cfg.sleep(backoffMs(res, attempt, cfg.nowMs()), signal);
    }
  }
  return err(
    new AppError(ERROR_IDS.INTERCOM_RATE_LIMITED, "intercom rate limit retries exhausted", {
      path,
      attempts: INTERCOM_MAX_RATE_LIMIT_RETRIES + 1,
    }),
  );
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
