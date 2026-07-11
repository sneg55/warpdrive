// Void/embed elements carry content even with no surrounding text; stripping every tag
// (below) would wrongly null an image-only note, so short-circuit them as non-blank first.
const CONTENT_VOID_ELEMENT = /<\s*(img|hr|video|iframe|audio|embed|object)\b/i;

// RichTextBody emits markup like "<p></p>" or "<p><br></p>" when a user types then
// clears the editor. Treat that as blank so we store/render null instead of an empty note row.
export function isBlankHtml(html: string): boolean {
  if (CONTENT_VOID_ELEMENT.test(html)) return false;
  return (
    html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim() === ""
  );
}
