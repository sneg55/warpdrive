import Link from "next/link";
import type React from "react";

interface PipelineBreadcrumbProps {
  pipelineId: string;
  pipelineName: string;
  currentStageName: string | null;
}

// Pipedrive header breadcrumb: real pipeline name (links back to its board) then the current stage,
// e.g. "Sales pipeline > Proposal Made". Replaces the old hard-coded literal "Pipeline".
export function PipelineBreadcrumb({
  pipelineId,
  pipelineName,
  currentStageName,
}: PipelineBreadcrumbProps): React.ReactNode {
  return (
    <p className="text-sm text-muted-foreground">
      <Link href={`/pipeline/${pipelineId}`} className="hover:text-foreground hover:underline">
        {pipelineName}
      </Link>
      {currentStageName !== null && (
        <>
          {" "}
          &rsaquo; <span className="font-medium text-foreground">{currentStageName}</span>
        </>
      )}
    </p>
  );
}
