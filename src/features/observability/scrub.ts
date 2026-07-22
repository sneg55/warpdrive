const REDACTED = "[redacted]";
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Keys whose VALUES may carry third-party contact PII. Redacted unless explicitly safe.
const PII_KEY_RE = /email|name|subject|body|content|phone|address/i;
// Custom-event keys we control and know are shape-only, never raw record data.
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

// PostHog builds its exception payload ($exception_list: message + stack) directly from the raw
// error, which bypasses the property scrub in scrubProperties. Hand captureException an error whose
// message and stack already have emails redacted so a customer address in an error string cannot
// leak into a replay or exception event. Only emails are stripped, matching the project's "internal
// CRM, unmask except email content" stance. Non-error, non-string inputs pass through by reference.
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
