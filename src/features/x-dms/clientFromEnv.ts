import { abortableSleep } from "@/features/intercom/intercomHttp";
import { xDmSettings } from "./settings";
import type { XClient } from "./types";
import { makeXClient } from "./xClient";

export function xClientFromEnv(): XClient | null {
  const settings = xDmSettings();
  if (settings === null) return null;
  return makeXClient({ settings, fetch, sleep: abortableSleep, nowMs: () => Date.now() });
}
