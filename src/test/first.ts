export function first<T>(items: T[], what: string): T {
  const item = items[0];
  if (item === undefined) throw new Error(`expected at least one ${what}, found none`);
  return item;
}
