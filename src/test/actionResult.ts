/**
 * Return type for a mocked server action in tests.
 *
 * Writing `vi.fn(() => Promise.resolve({ ok: true as const }))` infers the SUCCESS branch as the
 * whole return type, so the failure case a test wants to drive
 * (`mockResolvedValueOnce({ ok: false, error: { id } })`) does not type-check. Annotating the mock
 * with this union restores the discriminated shape the real action returns.
 *
 * Mirrors src/types/result.ts, narrowed to what the mocks need: callers only read `error.id`.
 */
export type MockActionResult<V = undefined> =
  | { ok: true; value: V }
  | { ok: false; error: { id: string } };

/** For actions that report success with no payload. */
export type MockVoidActionResult = { ok: true } | { ok: false; error: { id: string } };
