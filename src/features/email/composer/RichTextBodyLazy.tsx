"use client";

// TipTap + ProseMirror is the single heaviest client dependency in the app, and it was statically
// imported into ten route bundles (deal, lead, person, org, inbox, settings/email, and their
// @modal variants). The composer is collapsed by default on every one of those surfaces, so the
// editor is almost never on screen at first paint.
//
// Loading it through next/dynamic moves it into its own chunk fetched on first render of the
// editor. ssr:false is safe and intended here: RichTextBody already sets `immediatelyRender:false`
// precisely because TipTap cannot render during SSR.
//
// The export name matches RichTextBody so call sites only change their import path.
import dynamic from "next/dynamic";

// Reserve the editor's minimum height so swapping the real editor in does not shift the
// surrounding composer layout.
function EditorPlaceholder(): React.ReactNode {
  return <div aria-hidden="true" className="min-h-24" />;
}

export const RichTextBody = dynamic(async () => (await import("./RichTextBody")).RichTextBody, {
  ssr: false,
  loading: EditorPlaceholder,
});

/**
 * Start fetching the editor chunk before it is rendered.
 *
 * The editor autofocuses on mount, so a user who clicks the collapsed composer and immediately
 * types would lose those keystrokes while the chunk is still in flight. Call this on the first
 * signal of intent (hover, keyboard focus) to have the chunk warm by the time it is needed.
 * Safe to call repeatedly: the module registry dedupes.
 */
export function preloadRichTextBody(): void {
  void import("./RichTextBody");
}
