import { type FilterDefinition, filterDefinition } from "./schemas";

// Parse a saved_filters jsonb definition into a trusted FilterDefinition at the server boundary.
// Runs where zod already lives (tRPC procedures / repos) so the board client receives typed data
// and never has to ship zod just to parse its own saved filters. A malformed definition collapses
// to a no-op empty filter rather than throwing, matching the board's defensive default.
export function parseSavedFilterDefinition(raw: unknown): FilterDefinition {
  const parsed = filterDefinition.safeParse(raw);
  return parsed.success ? parsed.data : { conditions: [] };
}
