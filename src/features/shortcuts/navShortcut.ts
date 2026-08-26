// Pipedrive binds the number row to the primary nav: 1 goes to the first item, 2 to the second and
// so on. Keys past the end of our nav are unbound rather than clamped, so nothing surprising fires.

export function navHrefForKey(key: string, items: readonly { href: string }[]): string | null {
  if (key.length !== 1 || key < "1" || key > "9") return null;
  return items[Number(key) - 1]?.href ?? null;
}
