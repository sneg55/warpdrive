import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { sanitizeAuthorHtml } from "./sanitizeHtml";

export async function listTemplates(
  db: Db,
  args: { actor: AuthUser },
  signal: AbortSignal,
): Promise<{ id: string; name: string; subject: string | null }[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT id, name, subject FROM email_templates
      WHERE owner_id=${args.actor.id} OR is_shared = true
      ORDER BY name ASC
    `)
  ).rows as { id: string; name: string; subject: string | null }[];
  signal.throwIfAborted();
  return rows;
}

export interface TemplateDetail {
  id: string;
  name: string;
  subject: string | null;
  bodyHtml: string;
}

export async function getTemplate(
  db: Db,
  args: { id: string; actor: AuthUser },
  signal: AbortSignal,
): Promise<Result<TemplateDetail, AppError>> {
  signal.throwIfAborted();
  const row = (
    await db.execute(sql`
      SELECT id, name, subject, body_html AS "bodyHtml", owner_id AS "ownerId", is_shared AS "isShared"
      FROM email_templates WHERE id=${args.id}
    `)
  ).rows[0] as
    | {
        id: string;
        name: string;
        subject: string | null;
        bodyHtml: string;
        ownerId: string;
        isShared: boolean;
      }
    | undefined;
  signal.throwIfAborted();

  if (row === undefined || (row.ownerId !== args.actor.id && row.isShared !== true)) {
    return err(
      new AppError(ERROR_IDS.PERM_TEMPLATE_DENIED, "template not found or not accessible", {}),
    );
  }

  return ok({
    id: row.id,
    name: row.name,
    subject: row.subject,
    bodyHtml: sanitizeAuthorHtml(row.bodyHtml),
  });
}

export interface SettingsTemplate {
  id: string;
  name: string;
  subject: string | null;
  bodyHtml: string;
  isShared: boolean;
  isOwn: boolean;
  ownerName: string;
  createdAt: string;
}

export async function listTemplatesForSettings(
  db: Db,
  args: { actor: AuthUser },
  signal: AbortSignal,
): Promise<SettingsTemplate[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT t.id, t.name, t.subject, t.body_html AS "bodyHtml", t.owner_id AS "ownerId",
             t.is_shared AS "isShared", u.name AS "ownerName", t.created_at AS "createdAt"
      FROM email_templates t
      JOIN users u ON u.id = t.owner_id
      WHERE t.owner_id=${args.actor.id} OR t.is_shared = true
      ORDER BY (t.owner_id=${args.actor.id}) DESC,
               (CASE WHEN t.owner_id=${args.actor.id} THEN t.sort_order END) ASC NULLS LAST,
               t.name ASC
    `)
  ).rows as {
    id: string;
    name: string;
    subject: string | null;
    bodyHtml: string;
    ownerId: string;
    isShared: boolean;
    ownerName: string;
    createdAt: string | Date;
  }[];
  signal.throwIfAborted();
  return rows.map(({ ownerId, createdAt, ...r }) => ({
    ...r,
    bodyHtml: sanitizeAuthorHtml(r.bodyHtml),
    isOwn: ownerId === args.actor.id,
    createdAt: typeof createdAt === "string" ? createdAt : createdAt.toISOString(),
  }));
}

export async function listSignatures(
  db: Db,
  args: { actor: AuthUser },
  signal: AbortSignal,
): Promise<{ id: string; name: string; isDefault: boolean; bodyHtml: string }[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT id, name, is_default AS "isDefault", body_html AS "bodyHtml" FROM signatures
      WHERE user_id=${args.actor.id} ORDER BY is_default DESC, name ASC
    `)
  ).rows as { id: string; name: string; isDefault: boolean; bodyHtml: string }[];
  signal.throwIfAborted();
  return rows.map((r) => ({ ...r, bodyHtml: sanitizeAuthorHtml(r.bodyHtml) }));
}
