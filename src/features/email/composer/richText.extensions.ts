import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import type { SingleCommands } from "@tiptap/react";
import { Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

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
          commands.setMark("textStyle", { fontSize: null }) && commands.removeEmptyTextStyle(),
    };
  },
});

export const richTextExtensions = [
  StarterKit.configure({
    strike: {},
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
    autolink: false,
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
