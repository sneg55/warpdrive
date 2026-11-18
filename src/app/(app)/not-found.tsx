import Link from "next/link";
import type React from "react";
import { STRINGS } from "@/constants/strings";
import { NotFoundTelemetry } from "@/features/observability/NotFoundTelemetry";

export default function AppNotFound(): React.ReactNode {
  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-center">
      <NotFoundTelemetry />
      <h1 className="text-lg font-semibold">{STRINGS.errors.notFound}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{STRINGS.errors.notFoundBody}</p>
      <Link href="/pipeline" className="text-sm font-medium underline underline-offset-4">
        {STRINGS.errors.backToPipeline}
      </Link>
    </div>
  );
}
