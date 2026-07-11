import { readCsrfToken } from "@/utils/csrfCookie";
import { ALLOWED_CONTENT_TYPES } from "./contentTypes";
import { ATTACH_MAX_FILE_BYTES, FILE_ATTACHMENTS_STRINGS } from "./fileAttachments.constants";
import type { FileEntityType } from "./listFilesForEntity";
import { confirmUploadAction, requestUploadAction } from "./serverActions";

// Allowed MIME types as a plain Set for O(1) lookup (mirrors AttachButton).
const ALLOWED_TYPES = new Set<string>(ALLOWED_CONTENT_TYPES);
const MAX_MB = Math.round(ATTACH_MAX_FILE_BYTES / 1024 / 1024);

// Run the presigned-upload handshake for one file: client-side size/type guard
// (mirrors AttachButton), request a presigned POST, POST the bytes to storage,
// then confirm server-side. Returns null on success or a user-facing error string.
// Kept as a plain async function (no React) so the component stays small and the
// handshake is independently testable.
export async function uploadOneFile(
  file: File,
  entityType: FileEntityType,
  entityId: string,
): Promise<string | null> {
  if (file.size > ATTACH_MAX_FILE_BYTES) {
    return FILE_ATTACHMENTS_STRINGS.tooLarge(file.name, MAX_MB);
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return FILE_ATTACHMENTS_STRINGS.unsupportedType(file.name);
  }

  // Wrap the network + action calls: fetch REJECTS (does not return {ok:false}) on a network
  // drop / CORS failure, and an action could throw; both must surface as a user-facing error
  // string rather than an unhandled rejection that leaves the upload silently doing nothing.
  try {
    const csrfToken = readCsrfToken();
    const requested = await requestUploadAction(csrfToken, {
      entityType,
      entityId,
      filename: file.name,
      contentType: file.type as (typeof ALLOWED_CONTENT_TYPES)[number],
      size: file.size,
    });
    if (!requested.ok) return FILE_ATTACHMENTS_STRINGS.uploadFailed(file.name);
    const { fileId, post } = requested.value;

    const form = new FormData();
    for (const [k, v] of Object.entries(post.fields)) form.append(k, v);
    form.append("file", file);
    const uploaded = await fetch(post.url, { method: "POST", body: form });
    if (!uploaded.ok) return FILE_ATTACHMENTS_STRINGS.uploadFailed(file.name);

    const confirmed = await confirmUploadAction(csrfToken, fileId);
    if (!confirmed.ok) return FILE_ATTACHMENTS_STRINGS.uploadFailed(file.name);
    return null;
  } catch {
    return FILE_ATTACHMENTS_STRINGS.uploadFailed(file.name);
  }
}
