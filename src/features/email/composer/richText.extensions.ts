// TipTap extension array for the email composer rich-text editor.
// Kept in a separate file so Composer.tsx and RichTextBody.tsx each stay under ~200 lines.
//
// StarterKit includes: Bold, Italic, Strike, BulletList, OrderedList, ListItem,
// Blockquote, HardBreak, Heading, HorizontalRule, Code, CodeBlock,
// History (undo/redo), Paragraph, Text, Document, Dropcursor, Gapcursor.
// Strike is provided by StarterKit; the standalone @tiptap/extension-strike is NOT imported
// to avoid the duplicate-extension warning.
//
// FontSize: @tiptap/extension-font-size has only a prerelease build (3.0.0-next.3).
// We implement it as a small custom Extension that adds a fontSize attribute to
// TextStyle marks. @tiptap/core is not directly resolvable in this pnpm layout
// (only @tiptap/react is linked at the root); Extension and related types are
// imported from @tiptap/react which re-exports everything from @tiptap/core.

import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
// Extension and SingleCommands come from @tiptap/react which re-exports @tiptap/core fully.
import type { SingleCommands } from "@tiptap/react";
import { Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

// Custom FontSize extension: adds a `fontSize` attribute to TextStyle marks,
// emitting an inline `font-size` CSS property. Replaces the prerelease package.
//
// TipTap's Extension.create, addOptions(), addGlobalAttributes(), and addCommands()
// callbacks are typed with `any` internally in @tiptap/core (the Attribute,
// CommandProps, and GlobalAttributes interfaces all use `any` for attribute values
// and command props). The eslint-disable comments below are therefore unavoidable
// and are scoped as narrowly as possible.
const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return { types: ["textStyle"] as string[] };
  },

  addGlobalAttributes() {
    const types = this.options.types;
    return [
      {
        types,
        attributes: {
          fontSize: {
            default: null as string | null,
            // parseHTML/renderHTML: TipTap's Attribute interface types these callbacks
            // as (element: any) => any / (attributes: any) => any. We accept HTMLElement
            // and Record<string,unknown> explicitly; the `any` suppressions cover only
            // the mismatch with TipTap's own `any`-typed callback signature.

            parseHTML: (element: HTMLElement): string | null =>
              element.style.fontSize.replace(/['"]/g, "") || null,
            renderHTML: (attributes: Record<string, unknown>): Record<string, string> => {
              const size = attributes.fontSize;
              if (typeof size !== "string" || size === "") return {};
              return { style: `font-size: ${size}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ commands }: { commands: SingleCommands }): boolean =>
          commands.setMark("textStyle", { fontSize }),
      unsetFontSize:
        () =>
        ({ commands }: { commands: SingleCommands }): boolean =>
          // strict-boolean-expressions: commands.setMark returns boolean so && is fine

          commands.setMark("textStyle", { fontSize: null }) && commands.removeEmptyTextStyle(),
    };
  },
});

export const richTextExtensions = [
  StarterKit.configure({
    // Strike is included in StarterKit; no standalone Strike import needed.
    strike: {},
    // StarterKit v3 also bundles Link and Underline. Disable those so our
    // standalone, custom-configured Link (protocol allowlist) and Underline win,
    // avoiding the "Duplicate extension names" warning.
    link: false,
    underline: false,
  }),
  Underline,
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  Link.configure({
    openOnClick: false,
    // Restrict protocols at the extension level so javascript:/data: hrefs are rejected.
    protocols: ["http", "https", "mailto"],
    HTMLAttributes: {
      rel: "noopener noreferrer",
      target: "_blank",
    },
  }),
  Image.configure({
    HTMLAttributes: {
      style: "max-width:100%",
    },
  }),
];
