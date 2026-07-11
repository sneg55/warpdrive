/**
 * The first element of a query result, or a loud failure.
 *
 * `screen.getAllBy*(...)[0]` is typed `T | undefined` under noUncheckedIndexedAccess, and passing
 * that straight into fireEvent does not type-check. Rather than a non-null assertion (banned by
 * lint, and silent when the query returns nothing), this narrows and explains what was missing.
 */
export function first<T>(items: T[], what: string): T {
  const item = items[0];
  if (item === undefined) throw new Error(`expected at least one ${what}, found none`);
  return item;
}
