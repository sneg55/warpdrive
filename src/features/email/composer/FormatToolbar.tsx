"use client";

import type { Editor } from "@tiptap/react";
import { useState } from "react";
import { type FormatToolbarActions, FormatToolbarControls } from "./FormatToolbarControls";
import { InsertUrlDialog, type InsertUrlKind } from "./InsertUrlDialog";

interface FormatToolbarProps {
  editor: Editor;
}

/**
 * Connects shared toolbar controls and URL dialogs to a TipTap editor instance.
 * Visual controls live in FormatToolbarControls so editor commands remain easy to audit.
 */
export function FormatToolbar({ editor }: FormatToolbarProps): React.ReactNode {
  const [fontFamily, setFontFamily] = useState("");
  const [fontSize, setFontSize] = useState("");
  const [textColor, setTextColor] = useState("#000000");
  const [insertKind, setInsertKind] = useState<InsertUrlKind | null>(null);

  const actions: FormatToolbarActions = {
    undo: () => editor.chain().focus().undo().run(),
    redo: () => editor.chain().focus().redo().run(),
    bold: () => editor.chain().focus().toggleBold().run(),
    italic: () => editor.chain().focus().toggleItalic().run(),
    underline: () => editor.chain().focus().toggleUnderline().run(),
    strike: () => editor.chain().focus().toggleStrike().run(),
    bulletList: () => editor.chain().focus().toggleBulletList().run(),
    orderedList: () => editor.chain().focus().toggleOrderedList().run(),
    outdent: () => editor.chain().focus().liftListItem("listItem").run(),
    indent: () => editor.chain().focus().sinkListItem("listItem").run(),
    blockquote: () => editor.chain().focus().toggleBlockquote().run(),
    link: () => setInsertKind("link"),
    image: () => setInsertKind("image"),
    clearFormat: () => editor.chain().focus().clearNodes().unsetAllMarks().run(),
  };

  function handleFontFamily(value: string): void {
    setFontFamily(value);
    if (value === "") {
      editor.chain().focus().unsetFontFamily().run();
      return;
    }
    editor.chain().focus().setFontFamily(value).run();
  }

  function handleFontSize(value: string): void {
    setFontSize(value);
    if (value === "") {
      editor.chain().focus().unsetFontSize().run();
      return;
    }
    editor.chain().focus().setFontSize(value).run();
  }

  function handleColor(value: string): void {
    setTextColor(value);
    editor.chain().focus().setColor(value).run();
  }

  function handleDialogOpenChange(open: boolean): void {
    if (!open) setInsertKind(null);
  }

  function handleInsertUrl(url: string): void {
    if (insertKind === "link") {
      editor.chain().focus().setLink({ href: url }).run();
      return;
    }
    editor.chain().focus().setImage({ src: url }).run();
  }

  return (
    <>
      <FormatToolbarControls
        fontFamily={fontFamily}
        fontSize={fontSize}
        textColor={textColor}
        onFontFamilyChange={handleFontFamily}
        onFontSizeChange={handleFontSize}
        onTextColorChange={handleColor}
        actions={actions}
      />
      {insertKind !== null ? (
        <InsertUrlDialog
          kind={insertKind}
          open
          onOpenChange={handleDialogOpenChange}
          onInsert={handleInsertUrl}
        />
      ) : null}
    </>
  );
}
