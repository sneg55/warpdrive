const MERGE_TAG = /\{\{([^}]*)\}\}/g;
const DEFAULT_FILTER = /\|\s*default\s*:\s*"([^"]*)"/;
const LEADING_SEPARATOR = /^[\s,;:]+/;

function tagValue(body: string): string {
  return DEFAULT_FILTER.exec(body)?.[1] ?? "";
}

export function renderMergeTags(subject: string): string {
  if (!subject.includes("{{")) return subject;
  const filled = subject
    .replace(MERGE_TAG, (_tag, body: string) => tagValue(body))
    .replace(/\s+/g, " ")
    .replace(/\s+([,;:.!?])/g, "$1")
    .trim();
  const stripped = filled.replace(LEADING_SEPARATOR, "");
  if (stripped === filled) return filled;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}
