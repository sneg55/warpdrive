"use client";
import { useEffect, useRef, useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { ERROR_IDS } from "@/constants/errorIds";
import type { PrefActionResult } from "@/features/identity/preferencesActions";
import { setAppearanceAction } from "@/features/identity/preferencesActions";
import { readCsrfToken } from "@/utils/csrfCookie";
import {
  type Appearance,
  appearanceCookieValue,
  DARK_CLASS,
  isDarkAppearance,
  PREFERS_DARK_QUERY,
  parseAppearance,
} from "./appearance";

function prefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia(PREFERS_DARK_QUERY).matches;
}

function applyAppearance(value: Appearance): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the cookie must stay a real HTTP cookie for server-side SSR seeding, and cookieStore is async and absent in jsdom
  document.cookie = appearanceCookieValue(value);
  document.documentElement.classList.toggle(DARK_CLASS, isDarkAppearance(value, prefersDark()));
}

export interface AppearanceChoice {
  value: Appearance;
  choose: (next: string) => void;
}

export function useAppearanceChoice(stored: Appearance): AppearanceChoice {
  const reportError = useActionError();
  const [value, setValue] = useState<Appearance>(stored);
  const lastSaved = useRef<Appearance>(stored);
  const latestRequest = useRef(0);
  const inFlight = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    applyAppearance(stored);
  }, [stored]);

  useEffect(() => {
    if (value !== "system" || typeof matchMedia !== "function") return undefined;
    const mq = matchMedia(PREFERS_DARK_QUERY);
    const onChange = (): void => {
      document.documentElement.classList.toggle(DARK_CLASS, mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
    };
  }, [value]);

  async function save(appearance: Appearance): Promise<PrefActionResult> {
    try {
      return await setAppearanceAction({ appearance }, readCsrfToken());
    } catch {
      return { ok: false, error: { id: ERROR_IDS.DB_WRITE_FAILED } };
    }
  }

  async function run(next: string): Promise<void> {
    const appearance = parseAppearance(next);
    const request = latestRequest.current + 1;
    latestRequest.current = request;
    setValue(appearance);
    applyAppearance(appearance);
    const done = inFlight.current.then(() => save(appearance));
    inFlight.current = done.then(
      () => undefined,
      () => undefined,
    );
    const r = await done;
    if (r.ok) lastSaved.current = appearance;
    if (request !== latestRequest.current || r.ok) return;
    const landed = lastSaved.current;
    setValue(landed);
    applyAppearance(landed);
    reportError(r.error.id);
  }

  return { value, choose: (next) => void run(next) };
}
