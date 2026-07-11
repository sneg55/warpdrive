// Discriminated union for operational outcomes. Throw only for programmer errors.
export type Result<Ok, Err> = { ok: true; value: Ok } | { ok: false; error: Err };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

// Exhaustiveness guard: a switch that forgets a case fails at compile time here,
// and throws at runtime if an unexpected value slips through (programmer error).
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}
