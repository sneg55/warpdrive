import Link from "next/link";
import type React from "react";
import { STRINGS } from "@/constants/strings";

// Rendered when an authenticated page calls notFound(): a deal, person or org that does not exist,
// or that the actor may not see. Those two cases are deliberately indistinguishable here, because
// the repos return the same "not found" for a hidden record so existence itself does not leak.
export default function AppNotFound(): React.ReactNode {
  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-lg font-semibold">{STRINGS.errors.notFound}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{STRINGS.errors.notFoundBody}</p>
      <Link href="/pipeline" className="text-sm font-medium underline underline-offset-4">
        {STRINGS.errors.backToPipeline}
      </Link>
    </div>
  );
}
