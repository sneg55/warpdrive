import { AppError, ERROR_IDS, type ErrorId } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";

export const HTTP_OK = 200;
const HTTP_REDIRECT_FLOOR = 300;
const HTTP_REDIRECT_CEIL = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_UNAUTHORIZED = 401;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;
export const HTTP_UNPROCESSABLE = 422;
export const HTTP_TOO_MANY_REQUESTS = 429;
export const HTTP_UNAVAILABLE = 503;
export const REQUIRED_WARPDRIVE_CAPABILITY = 1;

export interface AgenticClientConfig {
  baseUrl: string;
  mailbox: string;
  clientId: string;
  clientSecret: string;
}

export interface Schema<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false };
}

export function fail(id: ErrorId, message: string, context?: Record<string, unknown>) {
  return err(new AppError(id, message, context));
}

function isRedirect(res: Response): boolean {
  if (res.type === "opaqueredirect" || res.status === 0) return true;
  return res.status >= HTTP_REDIRECT_FLOOR && res.status < HTTP_REDIRECT_CEIL;
}

export function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

export async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get("Retry-After");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface AgenticHttp {
  mailboxPath: string;
  raw: (
    path: string,
    signal: AbortSignal,
    init?: { method?: "GET" | "POST"; body?: unknown },
  ) => Promise<Result<Response, AppError>>;
  getJson: <T>(
    path: string,
    schema: Schema<T>,
    signal: AbortSignal,
    notFoundId?: ErrorId,
  ) => Promise<Result<T, AppError>>;
}

export function createAgenticHttp(cfg: AgenticClientConfig): AgenticHttp {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const mailboxPath = `/api/v1/mailboxes/${encodeURIComponent(cfg.mailbox)}`;

  async function raw(
    path: string,
    signal: AbortSignal,
    init: { method?: "GET" | "POST"; body?: unknown } = {},
  ): Promise<Result<Response, AppError>> {
    const headers: Record<string, string> = {
      "CF-Access-Client-Id": cfg.clientId,
      "CF-Access-Client-Secret": cfg.clientSecret,
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "manual",
        signal,
      });
    } catch (e) {
      if (isAbort(e)) throw e;
      return fail(ERROR_IDS.AINBOX_TRANSPORT_FAILED, "agentic inbox unreachable", { path });
    }
    if (isRedirect(res) || res.status === HTTP_FORBIDDEN || res.status === HTTP_UNAUTHORIZED) {
      return fail(ERROR_IDS.AINBOX_AUTH_FAILED, "agentic inbox rejected the credentials", {
        path,
        status: res.status,
      });
    }
    return ok(res);
  }

  async function getJson<T>(
    path: string,
    schema: Schema<T>,
    signal: AbortSignal,
    notFoundId: ErrorId = ERROR_IDS.AINBOX_MAILBOX_NOT_FOUND,
  ): Promise<Result<T, AppError>> {
    const res = await raw(path, signal);
    if (!res.ok) return res;
    if (res.value.status === HTTP_NOT_FOUND) {
      return fail(notFoundId, "agentic inbox resource not found", { path });
    }
    if (res.value.status !== HTTP_OK) {
      return fail(ERROR_IDS.AINBOX_TRANSPORT_FAILED, "agentic inbox request failed", {
        path,
        status: res.value.status,
      });
    }
    const parsed = schema.safeParse(await readJson(res.value));
    if (!parsed.success) {
      return fail(ERROR_IDS.AINBOX_SCHEMA_FAILED, "agentic inbox response did not match", { path });
    }
    return ok(parsed.data);
  }

  return { mailboxPath, raw, getJson };
}
