import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { GMAIL_THREADS_URL } from "@/constants/teamMailbox";
import { err, ok, type Result } from "@/types/result";

const threadListSchema = z.object({
  threads: z.array(z.object({ id: z.string() })).default([]),
  nextPageToken: z.string().optional(),
});
export type BackfillThreadList = z.infer<typeof threadListSchema>;
export type ListBackfillThreads = (args: {
  q: string;
  pageToken?: string;
  signal: AbortSignal;
}) => Promise<Result<BackfillThreadList, AppError>>;

export function createBackfillThreadLister(token: string): ListBackfillThreads {
  return async ({ q, pageToken, signal }) => {
    signal.throwIfAborted();
    try {
      const params = new URLSearchParams({ q, labelIds: "INBOX", includeSpamTrash: "false" });
      if (pageToken !== undefined) params.set("pageToken", pageToken);
      const response = await fetch(`${GMAIL_THREADS_URL}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!response.ok)
        return err(
          new AppError(ERROR_IDS.GMAIL_API_EXHAUSTED, "history import request failed", {
            status: response.status,
          }),
        );
      const raw: unknown = await response.json();
      signal.throwIfAborted();
      const parsed = threadListSchema.safeParse(raw);
      return parsed.success
        ? ok(parsed.data)
        : err(new AppError(ERROR_IDS.GMAIL_API_EXHAUSTED, "invalid history import response", {}));
    } catch (cause) {
      signal.throwIfAborted();
      return err(
        new AppError(ERROR_IDS.GMAIL_API_EXHAUSTED, "history import request failed", {
          cause: String(cause),
        }),
      );
    }
  };
}
