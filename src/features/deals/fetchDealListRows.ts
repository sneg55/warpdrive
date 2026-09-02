import type { CustomFieldRefLabels } from "@/features/custom-fields/refLabelsContext";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { browserTimeZone } from "@/lib/browserTimeZone";
import type { trpc } from "@/lib/trpc-client";
import type { DealListRow } from "./DealList";

export interface DealListPage {
  rows: DealListRow[];
  total: number;
  totalValue: string;
  refLabels: CustomFieldRefLabels;
}

interface DealListFetchArgs {
  pipelineId: string;
  archived: boolean;
  definition: FilterDefinition | undefined;
}

export async function fetchDealListRows(
  utils: ReturnType<typeof trpc.useUtils>,
  args: DealListFetchArgs,
): Promise<DealListPage> {
  const res = await utils.client.deal.list.query({
    pipelineId: args.pipelineId,
    offset: 0,
    limit: 500,
    archived: args.archived ? true : undefined,
    definition: args.definition,
    timeZone: browserTimeZone(),
  });
  return {
    rows: res.rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
    total: res.total,
    totalValue: res.totalValue,
    refLabels: res.refLabels,
  };
}
