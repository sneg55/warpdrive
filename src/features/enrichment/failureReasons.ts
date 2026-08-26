import { z } from "zod";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";

const S = ENRICHMENT_STRINGS.dialog;

// Widened on purpose: the map arrives from the wire, so a kind this build does not know must read
// as absent rather than index into the literal type.
const VERDICTS: Readonly<Record<string, string>> = ENRICHMENT_STRINGS.outcome;

const reasonsSchema = z.record(z.string(), z.string());

// The per-provider reasons the server put on the error context, as one line. Null when the context
// carries nothing renderable, which leaves the caller on its plain message.
export function failureReasonsText(context: Record<string, unknown> | undefined): string | null {
  const parsed = reasonsSchema.safeParse(context?.reasons);
  if (!parsed.success) return null;
  const lines = Object.entries(parsed.data).flatMap(([provider, kind]) => {
    const verdict = VERDICTS[kind];
    return verdict === undefined ? [] : [S.outcomeLine(provider, verdict)];
  });
  return lines.length === 0 ? null : lines.join(S.reasonSeparator);
}
