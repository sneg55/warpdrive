export function navHrefForKey(key: string, items: readonly { href: string }[]): string | null {
  if (key.length !== 1 || key < "1" || key > "9") return null;
  return items[Number(key) - 1]?.href ?? null;
}
