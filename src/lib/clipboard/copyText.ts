import { err, ok, type Result } from "@/types/result";

export type CopyFailureReason = "unavailable" | "denied" | "failed";

export interface CopyError {
  reason: CopyFailureReason;
  message: string;
}

const UNAVAILABLE_MESSAGE = "Clipboard API is not available";

function describeFailure(cause: unknown): CopyError {
  const message = cause instanceof Error ? cause.message : String(cause);
  const reason: CopyFailureReason =
    cause instanceof DOMException && cause.name === "NotAllowedError" ? "denied" : "failed";
  return { reason, message };
}

export async function copyText(text: string): Promise<Result<void, CopyError>> {
  const clipboard: Clipboard | undefined =
    typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (clipboard === undefined) {
    return err({ reason: "unavailable", message: UNAVAILABLE_MESSAGE });
  }
  try {
    await clipboard.writeText(text);
    return ok(undefined);
  } catch (cause) {
    return err(describeFailure(cause));
  }
}
