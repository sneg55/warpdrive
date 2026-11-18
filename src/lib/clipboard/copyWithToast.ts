import { toast } from "sonner";
import { CLIPBOARD_STRINGS, COPY_FAILED_TOAST_MS } from "@/constants/clipboard";
import type { Result } from "@/types/result";
import { type CopyError, copyText } from "./copyText";

export async function copyWithToast(
  text: string,
  successMessage: string = CLIPBOARD_STRINGS.copied,
): Promise<Result<void, CopyError>> {
  const result = await copyText(text);
  if (result.ok) {
    toast.success(successMessage);
  } else {
    toast.error(CLIPBOARD_STRINGS.failedManual, {
      description: text,
      duration: COPY_FAILED_TOAST_MS,
      classNames: { description: "select-text break-all font-mono text-xs" },
    });
  }
  return result;
}
