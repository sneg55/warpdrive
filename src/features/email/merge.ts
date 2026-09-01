const TOKEN = /\{\{([^{}]*?)\}\}/g;
const TAG = /<[^>]*>/g;
const NBSP_ENTITY = /&nbsp;/g;
const BARE_TOKEN = /^[\w.]+$/;

export function applyMergeFields(
  template: string,
  ctx: Record<string, string>,
  options?: { keepUnresolved?: boolean },
): string {
  return template.replace(TOKEN, (match, inner: string) => {
    const key = inner.replace(TAG, "").replace(NBSP_ENTITY, " ").trim();
    if (!BARE_TOKEN.test(key)) return match;
    const value = ctx[key];
    if (value !== undefined) return value;
    return options?.keepUnresolved === true ? match : "";
  });
}
