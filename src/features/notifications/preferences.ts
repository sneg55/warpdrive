import { and, eq } from "drizzle-orm";
import type { NotificationType } from "@/constants/notificationTypes";
import { NOTIFICATION_TYPES } from "@/constants/notificationTypes";
import type { Db } from "@/db/client";
import { notificationPreferences } from "@/db/schema";

// Single source of truth for the table defaults so both getPreferences and
// resolveDelivery read them from one place (DRY, no magic-boolean duplication).
const DEFAULT_PREFERENCE = { inApp: true, email: false } as const;

export async function getPreferences(
  db: Db,
  userId: string,
  signal: AbortSignal,
): Promise<Record<NotificationType, { inApp: boolean; email: boolean }>> {
  signal.throwIfAborted();
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  signal.throwIfAborted();

  const byType = new Map(rows.map((r) => [r.type, { inApp: r.inApp, email: r.email }]));

  const out = {} as Record<NotificationType, { inApp: boolean; email: boolean }>;
  for (const t of NOTIFICATION_TYPES) {
    out[t] = byType.get(t) ?? { ...DEFAULT_PREFERENCE };
  }
  return out;
}

export async function setPreference(
  db: Db,
  userId: string,
  type: NotificationType,
  prefs: { inApp: boolean; email: boolean },
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db
    .insert(notificationPreferences)
    .values({ userId, type, inApp: prefs.inApp, email: prefs.email })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.type],
      set: { inApp: prefs.inApp, email: prefs.email },
    });
  signal.throwIfAborted();
}

export async function resolveDelivery(
  db: Db,
  userId: string,
  type: NotificationType,
  signal: AbortSignal,
): Promise<{ inApp: boolean; email: boolean }> {
  signal.throwIfAborted();
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.type, type)));
  signal.throwIfAborted();

  return row ? { inApp: row.inApp, email: row.email } : { ...DEFAULT_PREFERENCE };
}
