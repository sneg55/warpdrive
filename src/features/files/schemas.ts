import { z } from "zod";
import { env } from "@/config/env";
import { FILE_ENTITY_TYPE } from "@/constants/fileEntityTypes";
// The allowlist lives in a client-safe module (no env import) and is re-exported
// here so existing server-side importers keep the same import path.
import { ALLOWED_CONTENT_TYPES } from "./contentTypes";

export { ALLOWED_CONTENT_TYPES };

// requestUpload boundary: validated exactly once at entry, trusted thereafter.
export const requestUploadInput = z.object({
  entityType: z.enum(FILE_ENTITY_TYPE),
  entityId: z.string().uuid(),
  filename: z.string().min(1),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  size: z.number().int().positive().max(env.MAX_FILE_BYTES),
});

export type RequestUploadInput = z.infer<typeof requestUploadInput>;

export const confirmUploadInput = z.object({ fileId: z.string().uuid() });
export const requestDownloadInput = z.object({ fileId: z.string().uuid() });
