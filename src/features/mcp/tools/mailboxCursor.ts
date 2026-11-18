import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { MailboxFolder } from "@/constants/inbox";
import { err, ok, type Result } from "@/types/result";

const inboxCursor = z.object({ lastMessageAt: z.string().nullable(), id: z.string().uuid() });
const folderCursor = z.object({ at: z.string(), id: z.string().uuid() });

const encodedCursor = z.discriminatedUnion("folder", [
  z.object({ folder: z.literal("inbox"), cursor: inboxCursor }),
  z.object({ folder: z.literal("sent"), cursor: folderCursor }),
  z.object({ folder: z.literal("archive"), cursor: folderCursor }),
]);

export type DecodedCursor = z.infer<typeof encodedCursor>;

export function encodeMailboxCursor(folder: MailboxFolder, cursor: unknown): string | null {
  if (cursor === null || cursor === undefined) return null;
  return Buffer.from(JSON.stringify({ folder, cursor })).toString("base64url");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function decodeMailboxCursor(
  folder: MailboxFolder,
  token: string,
): Result<DecodedCursor, AppError> {
  const parsed = encodedCursor.safeParse(parseJson(Buffer.from(token, "base64url").toString()));
  if (!parsed.success || parsed.data.folder !== folder) {
    return err(
      new AppError(
        ERROR_IDS.GMAIL_READ_INPUT_INVALID,
        "cursor is not a nextCursor from list_mailbox_threads for this folder",
        { folder },
      ),
    );
  }
  return ok(parsed.data);
}
