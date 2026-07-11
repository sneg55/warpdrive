import { z } from "zod";

// Zod's uuid check, reused so this predicate accepts exactly the same strings as the
// `z.string().uuid()` schemas that validate ids everywhere else in the app.
const uuidSchema = z.string().uuid();

// True when `value` is a canonical uuid. Detail-route repos call this before querying by id so a
// malformed [id] path param (e.g. "inbox") is treated as "not found" rather than reaching Postgres,
// which rejects the uuid cast and throws a 500 (leaking the SQL in dev).
export function isUuidParam(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}
