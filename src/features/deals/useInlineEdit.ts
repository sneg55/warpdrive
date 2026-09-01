import { useMutation, useQueryClient } from "@tanstack/react-query";
import { readCsrfToken } from "@/utils/csrfCookie";
import { DEAL_LIST_QUERY_ROOT } from "./dealListQueryKey";
import type { DealListRow } from "./dealListTypes";
import { updateDealAction } from "./updateAction";

export interface EditArgs {
  dealId: string;
  field: "title" | "value" | "expectedCloseDate" | "status";
  value: string | number | null;
  expectedUpdatedAt: string;
}

interface ListData {
  rows: DealListRow[];
  total: number;
  totalValue: string;
}

type RowSnapshot = Array<[readonly unknown[], DealListRow]>;

export function useInlineEdit(pipelineId: string) {
  const client = useQueryClient();
  const listKey = [DEAL_LIST_QUERY_ROOT, pipelineId];

  const restoreRow = (snapshot: RowSnapshot, dealId: string) => {
    for (const [key, row] of snapshot) {
      client.setQueryData<ListData>(key, (data) =>
        data === undefined
          ? data
          : { ...data, rows: data.rows.map((r) => (r.id === dealId ? row : r)) },
      );
    }
  };

  const mutation = useMutation({
    mutationFn: (args: EditArgs) =>
      updateDealAction(
        {
          dealId: args.dealId,
          expectedUpdatedAt: args.expectedUpdatedAt,
          [args.field]: args.value,
        },
        readCsrfToken(),
      ),

    onMutate: async (args: EditArgs) => {
      await client.cancelQueries({ queryKey: listKey });
      const previous: RowSnapshot = [];
      for (const [key, data] of client.getQueriesData<ListData>({ queryKey: listKey })) {
        const row = data?.rows.find((r) => r.id === args.dealId);
        if (row !== undefined) previous.push([key, row]);
      }
      client.setQueriesData<ListData>({ queryKey: listKey }, (data) =>
        data === undefined
          ? data
          : {
              ...data,
              rows: data.rows.map((r) =>
                r.id === args.dealId ? { ...r, [args.field]: args.value } : r,
              ),
            },
      );
      return { previous };
    },

    onError: (_err, args, ctx) => {
      if (ctx !== undefined) restoreRow(ctx.previous, args.dealId);
    },

    onSettled: (result, _err, args, ctx) => {
      if (result !== undefined && !result.ok && ctx !== undefined) {
        restoreRow(ctx.previous, args.dealId);
      }
      void client.invalidateQueries({ queryKey: listKey });
    },
  });

  return { editCell: (args: EditArgs) => mutation.mutate(args) };
}
