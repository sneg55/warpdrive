const CONTENT_VOID_ELEMENT = /<\s*(img|hr|video|iframe|audio|embed|object)\b/i;

export function isBlankHtml(html: string): boolean {
  if (CONTENT_VOID_ELEMENT.test(html)) return false;
  return (
    html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim() === ""
  );
}
