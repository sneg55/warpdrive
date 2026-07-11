import type { Db } from "@/db/client";
import { auditEvents } from "@/db/schema";

type AuditTarget =
  | "permission_set"
  | "visibility_group"
  | "pipeline"
  | "user"
  | "settings"
  | "deal"
  | "person"
  | "organization";

export interface AuditEventInput {
  actorId: string | null;
  targetType: AuditTarget;
  targetId: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  correlationId?: string | null;
}

// Writes one security-relevant change to audit_events (permissions spec 9).
export async function recordAudit(
  db: Db,
  event: AuditEventInput,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db.insert(auditEvents).values({
    actorId: event.actorId,
    targetType: event.targetType,
    targetId: event.targetId,
    action: event.action,
    before: event.before ?? null,
    after: event.after ?? null,
    correlationId: event.correlationId ?? null,
  });
  signal.throwIfAborted();
}
