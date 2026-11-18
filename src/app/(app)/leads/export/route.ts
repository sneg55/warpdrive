import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { columnsFromKeys, leadRowsToCsv } from "@/features/leads/inbox/exportCsv";
import { leadExportQuery } from "@/features/leads/inbox/exportQuery";
import { listLeadsForExport } from "@/features/leads/leadRepo";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { createContext } from "@/server/trpc/context";
import type { DealVisibilitySession } from "@/types/session";

export async function GET(req: NextRequest): Promise<Response> {
  const signal = AbortSignal.timeout(15_000);
  const { actor } = await createContext();
  if (actor === null) return new NextResponse("Unauthorized", { status: 401 });

  const parsed = leadExportQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });
  const q = parsed.data;

  const session: DealVisibilitySession = {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };

  try {
    const currency = await readBaseCurrency(db, signal);
    const rows = await listLeadsForExport(
      db,
      session,
      { filter: q.filter, offset: 0, limit: 500, sort: q.sort, filters: q.filters },
      signal,
    );
    const csv = leadRowsToCsv(rows, columnsFromKeys(q.columns), currency);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="leads.csv"',
      },
    });
  } catch {
    return new NextResponse("Export failed", { status: 500 });
  }
}
