"use client";
import type React from "react";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { formatUsPhone } from "@/utils/phone";

// Turn sidebar contact-field values into openable links so the user can dial / mail / visit without
// copy-pasting. Pure href builders (unit-tested) + a small display component the field rows reuse.

export function telHref(phone: string): string {
  // Dialers want an unformatted number; keep a leading + but drop spaces, dashes, parens.
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function mailtoHref(email: string): string {
  return `mailto:${email.trim()}`;
}

export function externalHref(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Display-mode anchor for an inline field value. External links open in a new tab with a safe
// rel; tel:/mailto: stay in the same context. The anchor is the display only, editing still goes
// through the row's hover pencil (InlineFieldShell), so navigating and editing never collide.
export function LinkValue({
  href,
  external = false,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  const { usPhoneFormat, emailLinksNewTab } = useInterfacePrefs();
  // Email links open in a new tab when the preference is on (Pipedrive parity). External links
  // always do; tel: links never do.
  const newTab = external || (emailLinksNewTab && href.startsWith("mailto:"));
  // US phone formatting is display-only: reformat the visible text of a tel: link, leaving the
  // digit-stripped href untouched so the dialer still gets a clean number.
  const display =
    usPhoneFormat && href.startsWith("tel:") && typeof children === "string"
      ? formatUsPhone(children)
      : children;
  return (
    <a
      href={href}
      className="text-primary hover:underline"
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {display}
    </a>
  );
}
