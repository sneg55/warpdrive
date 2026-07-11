import { useMutation, useQueryClient } from "@tanstack/react-query";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { BoardCard } from "./dealRepo";
import { updateDealAction } from "./updateAction";

export interface EditArgs {
  dealId: string;
  field: "title" | "value" | "expectedCloseDate" | "status";
  value: string | number | null;
  expectedUpdatedAt: string;
}

interface ListData {
  rows: Array<BoardCard & { updatedAt?: string }>;
  total: number;
  totalValue: string;
}

// Named constant so every consumer uses the same cache key shape.
export const DEALS_QUERY_KEY = (pipelineId: string) => ["deals", pipelineId] as const;

// Optimistic single-field inline edit for the DealList table.
// onMutate snapshots then patches the cache; onError and onSettled(ok:false) both
// restore the snapshot so the row reverts on any failure (UI spec §6 "revert on error").
export function useInlineEdit(pipelineId: string) {
  const client = useQueryClient();
  const key = DEALS_QUERY_KEY(pipelineId);

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
      // Cancel any in-flight refetches so they do not overwrite the optimistic patch.
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ListData>(key);
      if (previous !== undefined) {
        client.setQueryData<ListData>(key, {
          ...previous,
          rows: previous.rows.map((r) =>
            r.id === args.dealId ? { ...r, [args.field]: args.value } : r,
          ),
        });
      }
      return { previous };
    },

    onError: (_err, _args, ctx) => {
      // Thrown rejection (network error, unhandled promise): restore snapshot.
      if (ctx?.previous !== undefined) {
        client.setQueryData(key, ctx.previous);
      }
    },

    onSettled: (result, _err, _args, ctx) => {
      // ok:false result (stale precondition, permission denied, etc.) also reverts.
      if (result !== undefined && !result.ok && ctx?.previous !== undefined) {
        client.setQueryData(key, ctx.previous);
      }
      void client.invalidateQueries({ queryKey: key });
    },
  });

  return { editCell: (args: EditArgs) => mutation.mutate(args) };
}
