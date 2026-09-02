"use client";
import type React from "react";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { assertNever } from "@/types/result";
import { tokenizeLinks } from "./linkify";

const LINK_CLASS = "text-link underline break-all";
const NEW_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

export function LinkifiedText({ text }: { text: string }): React.ReactNode {
  const { emailLinksNewTab } = useInterfacePrefs();
  return tokenizeLinks(text).map((t, i) => {
    const key = `${i}-${t.value}`;
    switch (t.kind) {
      case "text":
        return t.value;
      case "url":
        return (
          <a key={key} href={t.href} className={LINK_CLASS} {...NEW_TAB}>
            {t.value}
          </a>
        );
      case "email":
        return (
          <a key={key} href={t.href} className={LINK_CLASS} {...(emailLinksNewTab ? NEW_TAB : {})}>
            {t.value}
          </a>
        );
      default:
        return assertNever(t);
    }
  });
}
