import { convertErrorMessage } from "./inbox/convertErrorMessage";

export type ConvertSurface = "banner" | "dialog";

export type ConvertOutcome = { ok: true } | { ok: false; id: string; message: string };

export function convertFailure(id: string): ConvertOutcome {
  return { ok: false, id, message: convertErrorMessage(id) };
}
