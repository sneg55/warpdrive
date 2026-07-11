"use client";

import { useEffect } from "react";
import { ensureCsrfAction } from "@/features/auth/csrfRefresh";

interface Props {
  hasCsrf: boolean;
}

// Fires ensureCsrfAction once on mount if the wd_csrf cookie was absent at SSR time.
// This ensures real-SSO sessions that predate the CSRF cookie change still get one.
export function CsrfRefresher({ hasCsrf }: Props): null {
  useEffect(() => {
    if (!hasCsrf) {
      void ensureCsrfAction();
    }
  }, [hasCsrf]);

  return null;
}
