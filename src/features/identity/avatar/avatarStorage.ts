// Client-safe avatar constants + key builders. NO env import so the profile-page
// upload component can import the allowlist/cap for its client-side guard without
// pulling the server-only env boundary into the browser bundle (mirrors files/contentTypes).

// Avatars are tiny and the serve route buffers the whole object in memory, so the cap
// is far below the 25 MB attachment limit.
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const AVATAR_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

const AVATAR_TYPE_SET = new Set<string>(AVATAR_CONTENT_TYPES);

export function isAvatarContentType(contentType: string): contentType is AvatarContentType {
  return AVATAR_TYPE_SET.has(contentType);
}

// Presigned-POST target. One stable key per user (derived from the server-trusted session id, so
// no untrusted path segment reaches a key, and the POST policy pins it so a user can only write
// their own upload path). Stable rather than per-attempt: an abandoned upload (presign issued but
// confirm never called) is simply overwritten by the user's next attempt and deleted on confirm,
// so at most one un-reaped object exists per user. Avatars write no files row, so the files-table
// reaper cannot see these objects; the stable key is their cleanup path.
export function avatarUploadKey(userId: string): string {
  return `avatars/uploads/${userId}`;
}

// One stable confirmed object per user. confirmAvatarUpload copies the validated upload
// object here (a key the still-valid presigned POST can never target, F33) and each new
// upload overwrites it; the ?v=uploadId version on the serve URL busts the browser cache.
export function avatarObjectKey(userId: string): string {
  return `avatars/${userId}`;
}

// Stable serve URL stored in users.avatar_url and rendered by <Avatar src>. The version
// query param changes on every upload so a replaced avatar is never served from cache.
export function avatarPublicUrl(userId: string, version: string): string {
  return `/api/users/${userId}/avatar?v=${version}`;
}

// Prefix that every uploaded-avatar serve URL starts with (see avatarPublicUrl). Used to tell a
// user-uploaded avatar apart from an external identity-provider photo URL or null.
const UPLOADED_AVATAR_PREFIX = "/api/users/";

// True when avatar_url points at our own upload-serve route (a user-uploaded avatar) rather than an
// external provider photo or null. Login must not overwrite an uploaded avatar with the identity's
// (often null) photo, which was silently wiping avatars on every re-login.
export function isUploadedAvatarUrl(url: string | null): boolean {
  return url !== null && url.startsWith(UPLOADED_AVATAR_PREFIX);
}
