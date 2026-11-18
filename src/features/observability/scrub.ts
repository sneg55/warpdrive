const REDACTED = "[redacted]";
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PII_KEY_RE = /email|name|subject|body|content|phone|address/i;
const SAFE_KEYS = new Set([
  "release",
  "commit",
  "route",
  "errorId",
  "action",
  "surface",
  "level",
  "message",
  "modalId",
  "reason",
  "stageFrom",
  "stageTo",
  "cancelled",
  "kind",
  "path",
  "digest",
]);

function redactEmails(value: string): string {
  return value.replace(EMAIL_RE, "[email]");
}

export function sanitizeErrorEmails(error: unknown): unknown {
  if (error instanceof Error) {
    const sanitized = new Error(redactEmails(error.message));
    sanitized.name = error.name;
    if (typeof error.stack === "string") sanitized.stack = redactEmails(error.stack);
    return sanitized;
  }
  if (typeof error === "string") return redactEmails(error);
  return error;
}

export function scrubProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "message" && typeof value === "string") {
      out[key] = redactEmails(value);
      continue;
    }
    if (key.startsWith("$") || SAFE_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    out[key] = PII_KEY_RE.test(key) ? REDACTED : value;
  }
  return out;
}

export function scrubEvent<T extends { properties?: Record<string, unknown> } | null>(event: T): T {
  if (event === null) return event;
  if (event.properties !== undefined) event.properties = scrubProperties(event.properties);
  return event;
}
