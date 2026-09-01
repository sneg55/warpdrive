import type { ProspectProfile } from "../providers/types";

export type ProspectMatch =
  | { kind: "new" }
  | { kind: "existing"; personId: string; personUpdatedAtIso: string };

export interface BadgedProspect extends ProspectProfile {
  match: ProspectMatch;
}
