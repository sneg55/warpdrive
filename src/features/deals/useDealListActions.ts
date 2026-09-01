"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { ERROR_IDS } from "@/constants/errorIds";
import { readCsrfToken } from "@/utils/csrfCookie";
import { archiveDealAction, archiveDealsAction } from "./archiveActions";
import { bulkStageAction } from "./bulkStageAction";
import { DEAL_LIST_QUERY_ROOT } from "./dealListQueryKey";

export interface DealListActions {
  bulkStage: (dealIds: string[], toStageId: string) => Promise<boolean>;
  bulkArchive: (dealIds: string[]) => Promise<boolean>;
  unarchive: (dealId: string) => void;
}

export function useDealListActions(): DealListActions {
  const router = useRouter();
  const reportError = useActionError();
  const queryClient = useQueryClient();

  const bulkStage = useCallback(
    async (dealIds: string[], toStageId: string): Promise<boolean> => {
      const r = await bulkStageAction({ dealIds, toStageId }, readCsrfToken());
      if (!r.ok) {
        reportError(r.error.id);
        return false;
      }
      await queryClient.invalidateQueries({ queryKey: [DEAL_LIST_QUERY_ROOT] });
      router.refresh();
      return true;
    },
    [router, reportError, queryClient],
  );

  const bulkArchive = useCallback(
    async (dealIds: string[]): Promise<boolean> => {
      const r = await archiveDealsAction(dealIds, true, readCsrfToken());
      if (!r.ok) {
        reportError(r.error.id);
        return false;
      }
      if (r.count < dealIds.length) reportError(ERROR_IDS.DEAL_BULK_ARCHIVE_PARTIAL);
      await queryClient.invalidateQueries({ queryKey: [DEAL_LIST_QUERY_ROOT] });
      router.refresh();
      return true;
    },
    [router, reportError, queryClient],
  );

  const unarchive = useCallback(
    (dealId: string): void => {
      void archiveDealAction({ dealId, archived: false }, readCsrfToken()).then((r) => {
        if (r.ok) router.refresh();
        else reportError(r.error.id);
      });
    },
    [router, reportError],
  );

  return { bulkStage, bulkArchive, unarchive };
}
