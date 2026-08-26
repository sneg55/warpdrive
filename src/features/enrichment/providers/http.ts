import type { OutcomeKind } from "./types";

const THROTTLE_FALLBACK_MS = 15 * 60 * 1000;
const QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Credit exhaustion has no agreed status code across the three vendors, so the body is the only
// signal. Matching on wording is crude; it is bounded by only ever running on a 4xx we would
// otherwise have called a provider_error, so a false positive costs a longer cooldown, not data.
const QUOTA_HINTS = ["credit", "quota exceeded", "insufficient funds", "out of balance"];

const ENTITLEMENT_HINTS = [
  "api_inaccessible",
  "not included in your",
  "not accessible to your plan",
  "not available on your plan",
];
const MESSAGE_NOT_ENTITLED = "Provider plan does not include this lookup";

function matches(lowered: string, hints: readonly string[]): boolean {
  return hints.some((hint) => lowered.includes(hint));
}

export interface StatusClassification {
  kind: OutcomeKind;
  message?: string;
  retryAfterIso?: string;
}

// Retry-After is either a delay in seconds or an HTTP date (RFC 9110). A past or unparseable
// value yields undefined so the caller falls back rather than storing a deadline already elapsed.
export function parseRetryAfter(raw: string | null, now: Date = new Date()): string | undefined {
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  if (/^-?\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (seconds <= 0) return undefined;
    return isoOrUndefined(now.getTime() + seconds * 1000, now);
  }

  const asDate = new Date(trimmed);
  return isoOrUndefined(asDate.getTime(), now);
}

// A header can name a delay past the representable Date range; toISOString would throw RangeError
// there and turn a handled throttle into an unhandled exception. Out of range reads as "no usable
// value", so the caller falls back to its own cooldown.
function isoOrUndefined(ms: number, now: Date): string | undefined {
  if (!Number.isFinite(ms) || ms <= now.getTime()) return undefined;
  const at = new Date(ms);
  if (Number.isNaN(at.getTime())) return undefined;
  return at.toISOString();
}

export function classifyStatus(
  status: number,
  body: string,
  headers: Headers,
  now: Date = new Date(),
): StatusClassification {
  if (status >= 200 && status < 300) return { kind: "ok" };

  if (status === 401 || status === 403) {
    const lowered = body.toLowerCase();
    if (matches(lowered, QUOTA_HINTS)) {
      return quota(now);
    }
    if (matches(lowered, ENTITLEMENT_HINTS)) {
      return { kind: "not_entitled", message: MESSAGE_NOT_ENTITLED };
    }
    return { kind: "auth", message: "API key was rejected" };
  }

  if (status === 429) {
    return {
      kind: "throttled",
      message: "Rate limit reached",
      retryAfterIso:
        parseRetryAfter(headers.get("retry-after"), now) ??
        new Date(now.getTime() + THROTTLE_FALLBACK_MS).toISOString(),
    };
  }

  if (status >= 400 && status < 500) {
    const lowered = body.toLowerCase();
    if (matches(lowered, QUOTA_HINTS)) return quota(now);
    if (matches(lowered, ENTITLEMENT_HINTS)) {
      return { kind: "not_entitled", message: MESSAGE_NOT_ENTITLED };
    }
  }

  // Message names the status only. The body can echo request headers, and an API key must never
  // reach a log line, a run row, or the dialog footer.
  return { kind: "provider_error", message: `Provider returned ${status}` };
}

function quota(now: Date): StatusClassification {
  return {
    kind: "quota",
    message: "Out of credits",
    retryAfterIso: new Date(now.getTime() + QUOTA_COOLDOWN_MS).toISOString(),
  };
}

export function pickString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function pickNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[,\s]/g, "");
  if (cleaned.length === 0) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}
