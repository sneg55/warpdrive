"use client";

import { useEffect } from "react";
import { ensureCsrfAction } from "@/features/auth/csrfRefresh";

interface Props {
  hasCsrf: boolean;
}

export function CsrfRefresher({ hasCsrf }: Props): null {
  useEffect(() => {
    if (!hasCsrf) {
      void ensureCsrfAction();
    }
  }, [hasCsrf]);

  return null;
}
