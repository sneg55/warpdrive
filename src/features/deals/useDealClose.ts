import { useMutation, useQueryClient } from "@tanstack/react-query";
import { readCsrfToken } from "@/utils/csrfCookie";
import { type BoardData, removeCard } from "./boardCache";
import { updateDealAction } from "./updateAction";
import { BOARD_QUERY_KEY } from "./useDealMove";

export interface DealCloseInput {
  dealId: string;
  status: "won" | "lost";
  expectedUpdatedAt: string;
}

export function useDealClose(pipelineId: string) {
  const client = useQueryClient();
  const key = BOARD_QUERY_KEY(pipelineId);

  const mutation = useMutation({
    mutationFn: (input: DealCloseInput) =>
      updateDealAction(
        { dealId: input.dealId, status: input.status, expectedUpdatedAt: input.expectedUpdatedAt },
        readCsrfToken(),
      ),

    onMutate: async (input: DealCloseInput) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<BoardData>(key);
      if (previous !== undefined) {
        client.setQueryData<BoardData>(key, removeCard(previous, input.dealId));
      }
      return { previous };
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) client.setQueryData(key, ctx.previous);
    },

    onSettled: (result, _err, _input, ctx) => {
      if (result !== undefined && result.ok === false && ctx?.previous !== undefined) {
        client.setQueryData(key, ctx.previous);
      }
      void client.invalidateQueries({ queryKey: key });
    },
  });

  return { close: (input: DealCloseInput) => mutation.mutate(input) };
}
