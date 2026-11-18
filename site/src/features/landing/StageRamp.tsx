import type { ReactNode } from "react";

const STAGE_FILLS = ["bg-stage-1", "bg-stage-2", "bg-stage-3", "bg-stage-4", "bg-stage-5"] as const;

export function StageRamp(): ReactNode {
  return (
    <div aria-hidden="true" className="mx-1.5 mb-2 flex gap-1">
      {STAGE_FILLS.map((fill) => (
        <span key={fill} className={`h-1 flex-1 rounded-full ${fill}`} />
      ))}
    </div>
  );
}
