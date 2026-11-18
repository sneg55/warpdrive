import { useMutation, useQueryClient } from "@tanstack/react-query";
import { readCsrfToken } from "@/utils/csrfCookie";
import { applyMove, type BoardData } from "./boardCache";
import { midpoint } from "./boardPosition";
import { moveDealAction } from "./moveAction";
import type { DealMoveInput } from "./schemas";

export const BOARD_QUERY_KEY = (pipelineId: string) => ["board", pipelineId] as const;

export function useDealMove(pipelineId: string) {
  const client = useQueryClient();
  const key = BOARD_QUERY_KEY(pipelineId);

  const mutation = useMutation({
    mutationFn: (input: DealMoveInput) => moveDealAction(input, readCsrfToken()),

    onMutate: async (input: DealMoveInput) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<BoardData>(key);
      if (previous !== undefined) {
        const position = midpoint(input.beforePosition, input.afterPosition);
        client.setQueryData<BoardData>(
          key,
          applyMove(previous, {
            dealId: input.dealId,
            toStageId: input.toStageId,
            boardPosition: position,
          }),
        );
      }
      return { previous };
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        client.setQueryData(key, ctx.previous);
      }
    },

    onSettled: (result, _err, _input, ctx) => {
      if (result !== undefined && result.ok === false && ctx?.previous !== undefined) {
        client.setQueryData(key, ctx.previous);
      }
      void client.invalidateQueries({ queryKey: key });
    },
  });

  return { move: (input: DealMoveInput) => mutation.mutate(input) };
}
