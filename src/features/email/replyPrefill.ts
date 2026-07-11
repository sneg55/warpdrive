// Pure recipient/subject/body derivation for the three reader compose actions
// (Reply, Reply all, Forward). No React, no I/O: ReaderActions calls this to build the
// Composer `prefill` prop. Kept pure so the recipient math (self-exclusion, dedup,
// subject prefixing) is unit-testable without mounting anything.

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

// Minimal escaper for the plain-text values (an email address) we splice into the
// forwarded-message header we build below. The quoted body itself (msg.bodyHtml) is
// already sanitized upstream (sanitizeInboundHtml in emailReads.ts); this only guards
// the header line we construct ourselves so it can never become an HTML injection sink.
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

// Adds prefix unless the subject already starts with it (case-insensitive), so
// replying/forwarding repeatedly never stacks "Re: Re:" or "Fwd: Fwd:".
function withSubjectPrefix(subject: string | null, prefix: string): string {
  const base = (subject ?? "").trim();
  if (base.toLowerCase().startsWith(prefix.toLowerCase())) return base;
  return `${prefix} ${base}`.trim();
}

// Case-insensitive dedup that keeps the first-seen casing.
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

  // Plain reply always targets the sender, even when the sender is self (the mailbox
  // owner's own last-sent follow-up, common in a BD thread before the prospect replies).
  // Self-exclusion applies only to reply-all's broader recipients + cc, never to plain
  // reply's single target: excluding self here would silently empty "To" and disable Send.
  const to =
    mode === "replyAll"
      ? dedupe(excludeSelf([msg.fromEmail, ...msg.toEmails], selfEmail))
      : dedupe([msg.fromEmail]);
  // cc also excludes anyone already in `to`: the same address should not appear twice
  // across the two fields on a reply-all.
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
