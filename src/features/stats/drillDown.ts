import { z } from "zod";
import {
  DRILL_DOWN_OWNER_ALL,
  DRILL_DOWN_OWNER_ME,
  DRILL_DOWN_PARAM,
  type DrillDownKind,
} from "@/constants/drillDown";

export type SearchParams = Record<string, string | string[] | undefined>;

const drillDownOwner = z.union([
  z.literal(DRILL_DOWN_OWNER_ME),
  z.literal(DRILL_DOWN_OWNER_ALL),
  z.string().uuid(),
]);

const drillDownParams = z.object({
  owner: drillDownOwner,
  from: z.string().date(),
  to: z.string().date(),
  pipelineId: z.string().uuid().nullable(),
});

export type DrillDown = z.infer<typeof drillDownParams>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseDrillDown(params: SearchParams, kind: DrillDownKind): DrillDown | null {
  if (first(params[DRILL_DOWN_PARAM.kind]) !== kind) return null;
  const parsed = drillDownParams.safeParse({
    owner: first(params[DRILL_DOWN_PARAM.owner]),
    from: first(params[DRILL_DOWN_PARAM.from]),
    to: first(params[DRILL_DOWN_PARAM.to]),
    pipelineId: first(params[DRILL_DOWN_PARAM.pipeline]) ?? null,
  });
  return parsed.success ? parsed.data : null;
}

export function resolveDrillDownOwner(owner: DrillDown["owner"], actorId: string): string | null {
  if (owner === DRILL_DOWN_OWNER_ME) return actorId;
  if (owner === DRILL_DOWN_OWNER_ALL) return null;
  return owner;
}
