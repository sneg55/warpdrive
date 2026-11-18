export type MockActionResult<V = undefined> =
  | { ok: true; value: V }
  | { ok: false; error: { id: string } };

export type MockVoidActionResult = { ok: true } | { ok: false; error: { id: string } };
