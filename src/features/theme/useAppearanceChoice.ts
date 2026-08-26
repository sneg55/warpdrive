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

// Write the cookie the inline no-flash script reads, then paint the class immediately so the
// change lands without a reload.
export function applyAppearance(value: Appearance): void {
  document.cookie = appearanceCookieValue(value);
  document.documentElement.classList.toggle(DARK_CLASS, isDarkAppearance(value, prefersDark()));
}

export interface AppearanceChoice {
  value: Appearance;
  choose: (next: string) => void;
}

// Owns picking an appearance: paint first, persist second, revert on failure. Separate from any
// one control because the same behaviour has to work from a menu and from a settings form.
export function useAppearanceChoice(stored: Appearance): AppearanceChoice {
  const reportError = useActionError();
  const [value, setValue] = useState<Appearance>(stored);
  const lastSaved = useRef<Appearance>(stored);
  // Only the newest save may commit or revert. An older one settling last would speak for a
  // choice the user has already moved off, reverting what is on screen or reporting a stale error.
  const latestRequest = useRef(0);
  // The save in flight, so the next one queues behind it and the writes land in click order.
  const inFlight = useRef<Promise<void>>(Promise.resolve());

  // A device that has never set the cookie (or set it before signing in elsewhere) must end up on
  // the account's stored choice, not on whatever the browser happens to be carrying.
  useEffect(() => {
    applyAppearance(stored);
  }, [stored]);

  // "System" is live: follow the OS while the page stays open.
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
    // Queue behind the save in flight. Ignoring a stale response is not enough on its own: two
    // concurrent writes can land out of order and leave the stored preference disagreeing with
    // the screen, which the next authenticated render would then undo.
    const done = inFlight.current.then(() => save(appearance));
    inFlight.current = done.then(
      () => undefined,
      () => undefined,
    );
    const r = await done;
    // Record what landed even for a superseded pick: it is what the database now holds, so it is
    // what a later failure must roll back to.
    if (r.ok) lastSaved.current = appearance;
    if (request !== latestRequest.current || r.ok) return;
    const landed = lastSaved.current;
    setValue(landed);
    applyAppearance(landed);
    reportError(r.error.id);
  }

  return { value, choose: (next) => void run(next) };
}
