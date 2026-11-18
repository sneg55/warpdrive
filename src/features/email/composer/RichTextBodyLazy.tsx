"use client";

import dynamic from "next/dynamic";

function EditorPlaceholder(): React.ReactNode {
  return <div aria-hidden="true" className="min-h-24" />;
}

export const RichTextBody = dynamic(async () => (await import("./RichTextBody")).RichTextBody, {
  ssr: false,
  loading: EditorPlaceholder,
});

export function preloadRichTextBody(): void {
  void import("./RichTextBody");
}
