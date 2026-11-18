"use client";
import Link from "next/link";
import type React from "react";
import { type RecordPreview, useRecordPreview } from "./recordPreviewStore";

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
