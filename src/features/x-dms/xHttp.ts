import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import type { XHttpConfig } from "./types";
import { problemSchema } from "./xSchemas";

const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_FLOOR = 500;
const RATE_LIMIT_RESET_HEADER = "x-rate-limit-reset";

export interface XRequestSpec {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  forbiddenIsSendRefusal?: boolean;
}

export function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

async function problemDetail(res: Response): Promise<string> {
  try {
    const parsed = problemSchema.safeParse(await res.json());
    return parsed.success ? (parsed.data.detail ?? "") : "";
  } catch {
    return "";
  }
}

async function statusError(spec: XRequestSpec, res: Response): Promise<AppError> {
  const path = new URL(spec.url).pathname;
  if (res.status === HTTP_TOO_MANY_REQUESTS) {
    const reset = Number(res.headers.get(RATE_LIMIT_RESET_HEADER));
    return new AppError(ERROR_IDS.X_RATE_LIMITED, "x rate limit reached", {
      path,
      resetAtMs: Number.isFinite(reset) && reset > 0 ? reset * 1000 : null,
    });
  }
  if (res.status === HTTP_FORBIDDEN && spec.forbiddenIsSendRefusal === true) {
    return new AppError(ERROR_IDS.X_SEND_REFUSED, "x refused the message", {
      path,
      status: res.status,
      detail: await problemDetail(res),
    });
  }
  return new AppError(ERROR_IDS.X_HTTP_FAILED, "x request failed", {
    path,
    status: res.status,
    transient: res.status >= HTTP_SERVER_ERROR_FLOOR,
  });
}

export async function xRequest(
  cfg: XHttpConfig,
  spec: XRequestSpec,
  signal: AbortSignal,
): Promise<Result<unknown, AppError>> {
  signal.throwIfAborted();
  let res: Response;
  try {
    res = await cfg.fetch(spec.url, {
      method: spec.method,
      headers: { Accept: "application/json", ...spec.headers },
      body: spec.body,
      signal,
    });
  } catch (e) {
    signal.throwIfAborted();
    return err(
      new AppError(ERROR_IDS.X_HTTP_FAILED, "x request did not complete", {
        path: new URL(spec.url).pathname,
        status: null,
        transient: true,
        cause: e instanceof Error ? e.message : String(e),
      }),
    );
  }
  if (!res.ok) return err(await statusError(spec, res));
  try {
    return ok(await res.json());
  } catch {
    signal.throwIfAborted();
    return ok(null);
  }
}
