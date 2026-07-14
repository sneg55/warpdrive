"use client";

// FormatToolbar: formatting controls wired to a TipTap editor instance.
// Controls: undo, redo, font-family (select), font-size (select), bold, italic,
// underline, strikethrough, text-color (input[type=color]), ordered list,
// bullet list, outdent, indent, blockquote, link, image, clear-format.
// Groups separated by vertical dividers. Brand tokens only; lucide icons, with the
// control name kept on aria-label/title (icon-only buttons, no visible text).
//
// Fix 2 (SECURITY): handleLink and handleImage validate URL scheme before calling
// the editor command. Allowed link schemes: http, https, mailto. Allowed image
// schemes: http, https, and data:image/ (inline images).
import type { Editor } from "@tiptap/react";
import {
  ALargeSmall,
  Bold,
  Image as ImageIcon,
  Indent,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  type LucideIcon,
  Outdent,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Tip } from "@/components/ui/tooltip";

const DEFAULT_FONT_LABEL = "Default";

// PD-style compact trigger classes for the font-family/size Selects: no border/bg, icon-width
// instead of the branded Select's default full-width bordered look, matching ToolButton's h-7
// footprint so the two controls sit flush with the icon-only buttons on either side.
const COMPACT_TRIGGER_CLASSNAME =
  "h-7 w-auto justify-start gap-0.5 rounded-md border-0 bg-transparent px-1.5 py-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground";

// Named constants so option lists are not inline magic arrays.
const FONT_FAMILY_OPTIONS: SelectOption[] = [
  { label: DEFAULT_FONT_LABEL, value: "" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
];

const FONT_SIZE_OPTIONS: SelectOption[] = [
  { label: DEFAULT_FONT_LABEL, value: "" },
  { label: "10", value: "10px" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "24", value: "24px" },
  { label: "32", value: "32px" },
];

// Allowed URL schemes for link insertion (Fix 2).
const LINK_ALLOWED_SCHEMES = /^(https?:|mailto:)/i;
// Allowed URL schemes for image insertion: http/https or inline data image (Fix 2).
const IMAGE_ALLOWED_SCHEMES = /^(https?:|data:image\/)/i;

interface FormatToolbarProps {
  editor: Editor;
}

function Divider(): React.ReactNode {
  return <span aria-hidden="true" className="mx-1 inline-block w-px self-stretch bg-border/60" />;
}

interface ToolButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  title?: string;
}

// Icon-only button: the control name lives on aria-label + title (tooltip), so the
// button is accessible and testable by name while staying compact and unlabeled.
function ToolButton({ label, icon: Icon, onClick, title }: ToolButtonProps): React.ReactNode {
  return (
    <Tip label={title ?? label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-[transform,background-color,color] hover:bg-accent hover:text-accent-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className="h-4 w-4" />
      </button>
    </Tip>
  );
}

export function FormatToolbar({ editor }: FormatToolbarProps): React.ReactNode {
  // Local mirrors of the applied font family/size so the branded (controlled) Select can
  // show the current pick. TipTap itself does not expose "reflect selection state" here;
  // this only tracks what the user last chose in this toolbar instance.
  const [fontFamily, setFontFamily] = useState("");
  const [fontSize, setFontSize] = useState("");

  function handleBold(): void {
    editor.chain().focus().toggleBold().run();
  }
  function handleItalic(): void {
    editor.chain().focus().toggleItalic().run();
  }
  function handleUnderline(): void {
    editor.chain().focus().toggleUnderline().run();
  }
  function handleStrike(): void {
    editor.chain().focus().toggleStrike().run();
  }
  function handleBulletList(): void {
    editor.chain().focus().toggleBulletList().run();
  }
  function handleOrderedList(): void {
    editor.chain().focus().toggleOrderedList().run();
  }
  function handleBlockquote(): void {
    editor.chain().focus().toggleBlockquote().run();
  }
  function handleIndent(): void {
    editor.chain().focus().sinkListItem("listItem").run();
  }
  function handleOutdent(): void {
    editor.chain().focus().liftListItem("listItem").run();
  }
  function handleUndo(): void {
    editor.chain().focus().undo().run();
  }
  function handleRedo(): void {
    editor.chain().focus().redo().run();
  }
  function handleClearFormat(): void {
    editor.chain().focus().clearNodes().unsetAllMarks().run();
  }

  // Fix 2: validate URL scheme before inserting a link.
  function handleLink(): void {
    const url = window.prompt("Enter URL");
    if (url === null || url === "") return;
    if (!LINK_ALLOWED_SCHEMES.test(url)) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  // Fix 2: validate URL scheme before inserting an image.
  function handleImage(): void {
    const src = window.prompt("Enter image URL");
    if (src === null || src === "") return;
    if (!IMAGE_ALLOWED_SCHEMES.test(src)) return;
    editor.chain().focus().setImage({ src }).run();
  }

  function handleFontFamily(value: string): void {
    setFontFamily(value);
    if (value === "") {
      editor.chain().focus().unsetFontFamily().run();
    } else {
      editor.chain().focus().setFontFamily(value).run();
    }
  }

  function handleFontSize(value: string): void {
    setFontSize(value);
    if (value === "") {
      editor.chain().focus().unsetFontSize().run();
    } else {
      editor.chain().focus().setFontSize(value).run();
    }
  }

  function handleColor(e: React.ChangeEvent<HTMLInputElement>): void {
    editor.chain().focus().setColor(e.target.value).run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1"
    >
      {/* Group: history */}
      <ToolButton label="Undo" icon={Undo2} onClick={handleUndo} />
      <ToolButton label="Redo" icon={Redo2} onClick={handleRedo} />
      <Divider />

      {/* Group: font family + size. PD-style compact triggers: a static glyph + caret
          (never the selected option's label), so these stay icon-width like the ToolButtons
          instead of the old wide "Default ▾" comboboxes. */}
      <Select
        ariaLabel="Font family"
        triggerTitle="Font family"
        triggerContent={<Type className="h-4 w-4" />}
        triggerClassName={COMPACT_TRIGGER_CLASSNAME}
        value={fontFamily}
        onChange={handleFontFamily}
        options={FONT_FAMILY_OPTIONS}
      />
      <Select
        ariaLabel="Font size"
        triggerTitle="Font size"
        triggerContent={<ALargeSmall className="h-4 w-4" />}
        triggerClassName={COMPACT_TRIGGER_CLASSNAME}
        value={fontSize}
        onChange={handleFontSize}
        options={FONT_SIZE_OPTIONS}
      />
      <label className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <span className="sr-only">Text color</span>
        <input
          type="color"
          aria-label="Text color"
          onChange={handleColor}
          defaultValue="#000000"
          className="h-5 w-5 cursor-pointer rounded border border-border p-0 transition-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <Divider />

      {/* Group: inline marks */}
      <ToolButton label="Bold" icon={Bold} onClick={handleBold} />
      <ToolButton label="Italic" icon={Italic} onClick={handleItalic} />
      <ToolButton label="Underline" icon={Underline} onClick={handleUnderline} />
      <ToolButton label="Strikethrough" icon={Strikethrough} onClick={handleStrike} />
      <Divider />

      {/* Group: lists + indent */}
      <ToolButton label="Bulleted list" icon={List} onClick={handleBulletList} />
      <ToolButton label="Ordered list" icon={ListOrdered} onClick={handleOrderedList} />
      <ToolButton label="Outdent" icon={Outdent} onClick={handleOutdent} />
      <ToolButton label="Indent" icon={Indent} onClick={handleIndent} />
      <ToolButton label="Blockquote" icon={Quote} onClick={handleBlockquote} />
      <Divider />

      {/* Group: insert */}
      <ToolButton label="Link" icon={LinkIcon} onClick={handleLink} />
      <ToolButton label="Image" icon={ImageIcon} onClick={handleImage} />
      <Divider />

      {/* Group: clear */}
      <ToolButton label="Clear format" icon={RemoveFormatting} onClick={handleClearFormat} />
    </div>
  );
}
