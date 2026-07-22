"use client";

// RichTextBody: TipTap-based rich-text editor for the email composer.
// Emits sanitised HTML via onChange on every editor update.
//
// Controlled-sync strategy (item 1):
//   The editor is uncontrolled by default; typing does not cause a setContent
//   loop. When the parent sets a non-empty `html` prop that differs from what
//   this component last emitted (lastEmittedRef), we call setContent so a
//   template apply or body reset is reflected immediately. Typing never triggers
//   setContent because typing updates lastEmittedRef via onUpdate/onCreate.
//
// Reset strategy (item 2b):
//   When `html` is reset to "" the editor is cleared via clearContent so stale
//   content is not retained. The parent also passes a fresh `key` (recipientsNonce)
//   which remounts the component entirely on reset.
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { MASK_CLASS } from "@/features/observability/replayMasking";
import { cn } from "@/lib/utils";
import { sanitizeAuthorHtml } from "../sanitizeHtml";
import { FormatToolbar } from "./FormatToolbar";
import { richTextExtensions } from "./richText.extensions";

interface RichTextBodyProps {
  html: string;
  onChange: (html: string) => void;
  // insertToken: when this value changes (non-empty), insert the text at the cursor.
  // Parent increments/changes it each time it wants to insert content.
  insertToken?: { text: string; seq: number };
  // Extra classes for the editable content surface. The activity composer uses this to give the
  // note its Pipedrive-style yellow background; the email composer leaves it unset (transparent).
  contentClassName?: string;
  // Classes for the outer editor frame (toolbar + content). Defaults to a bottom border only.
  // The email composer passes a white rounded-card treatment to match PD's framed editor.
  frameClassName?: string;
  // When true, the editor stretches to fill its (flex-column) parent's height and scrolls its
  // content internally, so a full-pane composer fills the viewport instead of floating as a short
  // box over dead space. Opt-in: settings/activity-note callers keep their intrinsic height.
  grow?: boolean;
}

export function RichTextBody({
  html,
  onChange,
  insertToken,
  contentClassName,
  frameClassName,
  grow = false,
}: RichTextBodyProps): React.ReactNode {
  // Track the last HTML we emitted so we can distinguish "parent changed the
  // prop" from "our own typing round-tripped back through state".
  const lastEmittedRef = useRef<string>("");

  const editor = useEditor({
    // Next.js SSR: render the editor only on the client to avoid hydration
    // mismatches. `editor` is null until the client effect runs, so every use
    // below is null-guarded.
    immediatelyRender: false,
    extensions: richTextExtensions,
    content: html,
    onUpdate({ editor: e }) {
      const raw = e.getHTML();
      const sanitized = sanitizeAuthorHtml(raw);
      lastEmittedRef.current = sanitized;
      onChange(sanitized);
    },
    // Emit sanitised HTML immediately after mount so the parent state
    // is synchronised with the (possibly sanitised) initial content.
    onCreate({ editor: e }) {
      const raw = e.getHTML();
      const sanitized = sanitizeAuthorHtml(raw);
      lastEmittedRef.current = sanitized;
      onChange(sanitized);
    },
  });

  // Controlled-sync: when the incoming html prop differs from both what we last
  // emitted AND the editor's current content, the parent changed it externally
  // (template apply, reset). Call setContent to reflect it. This never fires
  // during typing because typing keeps lastEmittedRef in sync.
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return;
    if (html === lastEmittedRef.current) return;
    // Parent changed the prop externally.
    if (html === "") {
      editor.commands.clearContent(/* emitUpdate= */ true);
    } else {
      // setContent always emits an update (triggers onUpdate), no second arg needed.
      editor.commands.setContent(html);
    }
  }, [html, editor]);

  // Insert field: when insertToken changes (seq bumps), insert as plain text so values
  // containing <, >, & are inserted literally and never parsed as markup.
  useEffect(() => {
    if (insertToken === undefined || insertToken.text === "") return;
    if (editor === null || editor.isDestroyed) return;
    editor.commands.insertContent({ type: "text", text: insertToken.text });
  }, [insertToken, editor]);

  return (
    <div
      className={cn(
        "flex flex-col",
        MASK_CLASS,
        "ph-no-capture",
        grow && "min-h-0 flex-1",
        frameClassName ?? "border-b border-border",
      )}
    >
      {/* PD docks the format toolbar BELOW the body: editor content first, then the toolbar. */}
      <EditorContent
        editor={editor}
        className={cn(
          "min-h-24 px-2 py-2 text-sm [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-24",
          // When growing, the content area fills the frame and scrolls internally so the format
          // toolbar stays docked at the bottom and the ProseMirror surface is a full-height target.
          grow && "min-h-0 flex-1 overflow-y-auto [&_.ProseMirror]:min-h-full",
          contentClassName,
        )}
      />
      {editor !== null && <FormatToolbar editor={editor} />}
    </div>
  );
}
