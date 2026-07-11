import { describe, expect, it } from "vitest";
import {
  AVATAR_CONTENT_TYPES,
  AVATAR_MAX_BYTES,
  avatarObjectKey,
  avatarPublicUrl,
  avatarUploadKey,
  isAvatarContentType,
} from "./avatarStorage";

const USER = "11111111-1111-1111-1111-111111111111";
const VERSION = "22222222-2222-2222-2222-222222222222";

describe("avatar storage keys", () => {
  it("scopes one stable upload key per user (self-healing, no per-attempt orphans)", () => {
    expect(avatarUploadKey(USER)).toBe(`avatars/uploads/${USER}`);
  });

  it("derives one stable confirmed object key per user", () => {
    expect(avatarObjectKey(USER)).toBe(`avatars/${USER}`);
  });

  it("upload and confirmed keys never collide (POST cannot target the confirmed key)", () => {
    expect(avatarUploadKey(USER)).not.toBe(avatarObjectKey(USER));
  });

  it("builds a stable serve URL with a cache-busting version", () => {
    expect(avatarPublicUrl(USER, VERSION)).toBe(`/api/users/${USER}/avatar?v=${VERSION}`);
  });
});

describe("avatar content-type allowlist", () => {
  it("accepts the supported image types", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(isAvatarContentType(t)).toBe(true);
    }
  });

  it("rejects non-image and unlisted types", () => {
    for (const t of ["application/pdf", "text/plain", "image/svg+xml", ""]) {
      expect(isAvatarContentType(t)).toBe(false);
    }
  });

  it("caps avatars well below the attachment limit", () => {
    expect(AVATAR_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(AVATAR_CONTENT_TYPES.length).toBeGreaterThan(0);
  });
});
