"use client";
import type React from "react";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { formatUsPhone } from "@/utils/phone";

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function mailtoHref(email: string): string {
  return `mailto:${email.trim()}`;
}

export function externalHref(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

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
  const newTab = external || (emailLinksNewTab && href.startsWith("mailto:"));
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
