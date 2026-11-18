"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COPY_STATUS_RESET_MS } from "@/constants/clipboard";
import type { Result } from "@/types/result";
import { type CopyError, copyText } from "./copyText";

export type CopyStatus = "idle" | "copied" | "failed";

export interface UseCopyToClipboard {
  status: CopyStatus;
  copy: (text: string) => Promise<Result<void, CopyError>>;
}

export function useCopyToClipboard(): UseCopyToClipboard {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async (text: string): Promise<Result<void, CopyError>> => {
    const result = await copyText(text);
    setStatus(result.ok ? "copied" : "failed");
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), COPY_STATUS_RESET_MS);
    return result;
  }, []);

  return { status, copy };
}
