// UI copy + limits for the reusable FileAttachments component. No magic strings
// in the component tree.

// Client-side size guard, mirrors the composer's ATTACH_MAX_FILE_BYTES (server
// re-validates against env.MAX_FILE_BYTES). A fast gate that avoids a round-trip
// for obviously oversized files.
export const ATTACH_MAX_FILE_BYTES = 26_214_400;

export const FILE_ATTACHMENTS_STRINGS = {
  uploadLabel: "Upload file",
  emptyLabel: "No files attached yet.",
  downloadLabel: (filename: string): string => `Download ${filename}`,
  tooLarge: (name: string, maxMb: number): string => `"${name}" is too large (max ${maxMb} MB).`,
  unsupportedType: (name: string): string => `"${name}" has an unsupported file type.`,
  uploadFailed: (name: string): string => `Upload failed for "${name}".`,
  downloadFailed: "Could not open that file.",
} as const;
