"use client";

import { useRef, useState, useTransition } from "react";
import { Switch } from "@/components/ui/Switch";
import { ERROR_IDS } from "@/constants/errorIds";
import { inviteUserAction } from "@/features/identity/actions/invite";
import { readCsrfToken } from "@/utils/csrfCookie";

const T = {
  emailLabel: "Email",
  emailPlaceholder: "person@example.com",
  nameLabel: "Name",
  namePlaceholder: "Full name",
  admin: "Admin",
  invite: "Invite",
  inviting: "Inviting...",
  inviteLinkLabel: "Invite link",
  copy: "Copy link",
  copied: "Copied",
} as const;

// warpdrive has no outbound email/invite delivery: inviteUser only pre-authorizes the email for
// Google SSO adoption on first login. So we never silently imply an email was sent. Instead we
// surface the shareable sign-in link (the app login URL) for the admin to pass along themselves.
function noEmailNotice(name: string, email: string): string {
  return `No email is sent automatically. Share the sign-in link below with ${name} (${email}), who signs in with Google using that address.`;
}

const MESSAGES: Record<string, string> = {
  [ERROR_IDS.AUTH_EMAIL_TAKEN]: "That email is already registered.",
  [ERROR_IDS.PERM_DENIED]: "You do not have permission to invite users.",
  [ERROR_IDS.AUTH_INVITE_INPUT_INVALID]: "Enter a valid email and name.",
};

function inviteErrorMessage(id: string): string {
  return MESSAGES[id] ?? "Something went wrong. Please try again.";
}

interface Props {
  onInvited: () => void;
}

export function InviteUserForm({ onInvited }: Props): React.ReactElement {
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Set on a successful invite so we can surface the no-email notice + shareable link.
  const [invited, setInvited] = useState<{ name: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const email = emailRef.current?.value.trim() ?? "";
    const name = nameRef.current?.value.trim() ?? "";
    if (email.length === 0 || name.length === 0) return;
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const result = await inviteUserAction(csrf, { email, name, isAdmin });
      if (!result.ok) {
        setError(inviteErrorMessage(result.error.id));
        return;
      }
      if (emailRef.current !== null) emailRef.current.value = "";
      if (nameRef.current !== null) nameRef.current.value = "";
      setIsAdmin(false);
      setCopied(false);
      setInvited({ name, email });
      onInvited();
    });
  }

  const loginUrl = typeof window === "undefined" ? "/login" : `${window.location.origin}/login`;

  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(loginUrl);
    setCopied(true);
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="invite-email" className="text-xs font-medium">
            {T.emailLabel}
          </label>
          <input
            ref={emailRef}
            id="invite-email"
            type="email"
            required
            placeholder={T.emailPlaceholder}
            className="rounded border px-3 py-1.5 text-sm"
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="invite-name" className="text-xs font-medium">
            {T.nameLabel}
          </label>
          <input
            ref={nameRef}
            id="invite-name"
            type="text"
            required
            maxLength={120}
            placeholder={T.namePlaceholder}
            className="rounded border px-3 py-1.5 text-sm"
            disabled={isPending}
          />
        </div>
        <span className="flex items-center gap-2 pb-1.5 text-sm">
          <Switch checked={isAdmin} onCheckedChange={setIsAdmin} label={T.admin} />
          {T.admin}
        </span>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white transition-transform active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          {isPending ? T.inviting : T.invite}
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {invited !== null && (
        <div role="status" className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
          <p className="text-sm text-muted-foreground">
            {noEmailNotice(invited.name, invited.email)}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label={T.inviteLinkLabel}
              value={loginUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border bg-background px-2.5 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => void copyLink()}
              className="shrink-0 rounded border px-3 py-1.5 text-sm font-medium transition-transform hover:bg-muted active:scale-[0.96]"
            >
              {copied ? T.copied : T.copy}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
