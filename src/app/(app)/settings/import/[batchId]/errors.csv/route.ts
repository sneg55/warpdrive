import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { importBatches, importRows } from "@/db/schema";
import { buildErrorCsv } from "@/features/import/errorReport";
import { can } from "@/features/permissions/can";
import { createContext } from "@/server/trpc/context";

const routeParams = z.object({ batchId: z.string().uuid() });

// GET the error report for one batch: only invalid/failed rows, gated to the owner + data.import.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const parsed = routeParams.safeParse(await params);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });
  const { batchId } = parsed.data;
  const { actor } = await createContext();
  if (actor === null) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(actor, "data.import")) return new NextResponse("Forbidden", { status: 403 });

  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  // Owner or admin, matching loadOwnedBatch (the tRPC read surfaces admins can already reach).
  if (batch === undefined || (batch.createdBy !== actor.id && actor.type !== "admin")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const rows = await db
    .select({ rowNumber: importRows.rowNumber, raw: importRows.raw, errors: importRows.errors })
    .from(importRows)
    .where(and(eq(importRows.batchId, batchId), inArray(importRows.status, ["invalid", "failed"])))
    .orderBy(importRows.rowNumber);

  const csv = buildErrorCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="import-${batchId}-errors.csv"`,
    },
  });
}
