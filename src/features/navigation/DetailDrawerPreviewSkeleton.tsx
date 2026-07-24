"use client";
import type React from "react";
import { DetailDrawerSkeleton } from "@/components/shell/skeletons";
import { useRecordPreview } from "./recordPreviewStore";

// The intercepted drawer's Suspense fallback. When the list captured a preview for THIS record, the
// skeleton paints the real name/subtitle immediately (the "instant" feel) while the server content
// streams; a missing or mismatched preview falls back to the plain gray skeleton unchanged.
export function DetailDrawerPreviewSkeleton({ recordId }: { recordId: string }): React.ReactNode {
  const preview = useRecordPreview((s) => s.preview);
  if (preview === null || preview.id !== recordId) {
    return <DetailDrawerSkeleton />;
  }
  const hasSubtitle = preview.subtitle !== undefined && preview.subtitle !== "";
  return (
    <DetailDrawerSkeleton
      header={
        <div>
          <h2 className="font-semibold text-foreground text-lg">{preview.title}</h2>
          {hasSubtitle ? <p className="text-muted-foreground text-sm">{preview.subtitle}</p> : null}
        </div>
      }
    />
  );
}
