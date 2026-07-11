// Replace {{ token }} merge fields (e.g. {{person.name}}) from a context map.
// Unknown tokens become the empty string so a missing field never leaks the raw
// {{token}} into a sent email.
export function applyMergeFields(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => ctx[key] ?? "");
}
