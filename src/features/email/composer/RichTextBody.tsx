"use client";

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
  insertToken?: { text: string; seq: number };
  contentClassName?: string;
  frameClassName?: string;
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
  const lastEmittedRef = useRef<string>("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: richTextExtensions,
    content: html,
    onUpdate({ editor: e }) {
      const raw = e.getHTML();
      const sanitized = sanitizeAuthorHtml(raw);
      lastEmittedRef.current = sanitized;
      onChange(sanitized);
    },
    onCreate({ editor: e }) {
      const raw = e.getHTML();
      const sanitized = sanitizeAuthorHtml(raw);
      lastEmittedRef.current = sanitized;
      onChange(sanitized);
    },
  });

  useEffect(() => {
    if (editor === null || editor.isDestroyed) return;
    if (html === lastEmittedRef.current) return;
    if (html === "") {
      editor.commands.clearContent(true);
    } else {
      editor.commands.setContent(html);
    }
  }, [html, editor]);

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
      <EditorContent
        editor={editor}
        className={cn(
          "min-h-24 px-2 py-2 text-sm [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-24",
          "[&_.ProseMirror_a]:text-link [&_.ProseMirror_a]:underline [&_.ProseMirror_a]:cursor-pointer",
          grow && "min-h-0 flex-1 overflow-y-auto [&_.ProseMirror]:min-h-full",
          contentClassName,
        )}
      />
      {editor !== null && <FormatToolbar editor={editor} />}
    </div>
  );
}
