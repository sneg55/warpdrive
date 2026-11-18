import { linkifyEscapedText } from "@/features/collaboration/linkify";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function plainTextToSafeHtml(text: string): string {
  if (text.trim() === "") return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return linkifyEscapedText(escapeHtml(normalized)).replace(/\n/g, "<br>");
}

export function plainTextToParagraphHtml(text: string): string {
  if (text.trim() === "") return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
