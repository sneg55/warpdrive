"use client";
import Link from "next/link";
import type React from "react";
import { type RecordPreview, useRecordPreview } from "./recordPreviewStore";

// A record detail link that captures what the list already knows about the record (its name, and a
// subtitle) into the preview store on click, so the intercepted drawer's skeleton paints the real
// name immediately instead of a gray bar. Use anywhere a list links to an intercepted detail route.
export function RecordLink({
  preview,
  href,
  className,
  children,
}: {
  preview: RecordPreview;
  href: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  const setPreview = useRecordPreview((s) => s.setPreview);
  return (
    <Link href={href} className={className} onClick={() => setPreview(preview)}>
      {children}
    </Link>
  );
}
