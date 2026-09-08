import { PERMISSION_FLAGS } from "@/constants/permissionFlags";

export function canManagePipelines(actor: { type: string; flags: ReadonlySet<string> }): boolean {
  return actor.type === "admin" || actor.flags.has(PERMISSION_FLAGS.PIPELINE_MANAGE);
}
