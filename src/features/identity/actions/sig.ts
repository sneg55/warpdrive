// Action-scoped AbortSignal factory. Kept in a non-"use server" module so
// Turbopack does not reject it as a non-async export from a server file.
export const SIG = (): AbortSignal => AbortSignal.timeout(8000);
