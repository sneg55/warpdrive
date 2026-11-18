"use client";
import type React from "react";
import { DetailDrawerSkeleton } from "@/components/shell/skeletons";
import { useRecordPreview } from "./recordPreviewStore";

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
