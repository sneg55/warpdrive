export type ReplyMode = "reply" | "replyAll" | "forward";

export interface ReplyPrefillSourceMessage {
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  bodyHtml: string;
}

export interface ReplyPrefill {
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] ?? c;
  });
}

function withSubjectPrefix(subject: string | null, prefix: string): string {
  const base = (subject ?? "").trim();
  if (base.toLowerCase().startsWith(prefix.toLowerCase())) return base;
  return `${prefix} ${base}`.trim();
}

function dedupe(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function excludeSelf(emails: string[], selfEmail: string): string[] {
  const self = selfEmail.toLowerCase();
  return emails.filter((e) => e.toLowerCase() !== self);
}

function quotedForwardBody(msg: ReplyPrefillSourceMessage): string {
  return (
    `<br><br>---------- Forwarded message ----------<br>` +
    `From: ${escapeHtml(msg.fromEmail)}<br><br>` +
    msg.bodyHtml
  );
}

export function buildReplyPrefill(
  mode: ReplyMode,
  msg: ReplyPrefillSourceMessage,
  selfEmail: string,
): ReplyPrefill {
  if (mode === "forward") {
    return {
      to: [],
      cc: [],
      subject: withSubjectPrefix(msg.subject, "Fwd:"),
      bodyHtml: quotedForwardBody(msg),
    };
  }

  const selfSent = msg.fromEmail.toLowerCase() === selfEmail.toLowerCase();
  const candidates =
    mode === "replyAll" || selfSent ? [msg.fromEmail, ...msg.toEmails] : [msg.fromEmail];
  const targets = dedupe(excludeSelf(candidates, selfEmail));
  const to = targets.length > 0 ? targets : dedupe([msg.fromEmail]);
  const cc =
    mode === "replyAll"
      ? excludeSelf(dedupe(msg.ccEmails), selfEmail).filter(
          (e) => !to.some((t) => t.toLowerCase() === e.toLowerCase()),
        )
      : [];

  return {
    to,
    cc,
    subject: withSubjectPrefix(msg.subject, "Re:"),
    bodyHtml: "",
  };
}
