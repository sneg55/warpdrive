import type { AvatarContentType } from "./avatarStorage";

// Detect an image type from the leading magic bytes of the actual object content. This is the
// real gate on "is this an image": the presigned-POST policy pins the object's declared
// Content-Type to whatever the client requested, so a confirm-time HEAD echoes that declared
// type back and cannot catch a client that declared image/png but POSTed other bytes. Sniffing
// the bytes closes that gap. Returns null when the content is not a supported image.
export function sniffImageType(bytes: Uint8Array): AvatarContentType | null {
  const b = bytes;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: "GIF87a" or "GIF89a"
  if (
    b.length >= 6 &&
    matchesAscii(b, 0, "GIF8") &&
    (b[4] === 0x37 || b[4] === 0x39) &&
    b[5] === 0x61
  ) {
    return "image/gif";
  }
  // WebP: "RIFF" .... "WEBP" (bytes 8-11), distinguishing it from other RIFF containers (WAVE/AVI).
  if (b.length >= 12 && matchesAscii(b, 0, "RIFF") && matchesAscii(b, 8, "WEBP")) {
    return "image/webp";
  }
  return null;
}

function matchesAscii(bytes: Uint8Array, offset: number, ascii: string): boolean {
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}
