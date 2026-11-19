export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const AVATAR_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

const AVATAR_TYPE_SET = new Set<string>(AVATAR_CONTENT_TYPES);

export function isAvatarContentType(contentType: string): contentType is AvatarContentType {
  return AVATAR_TYPE_SET.has(contentType);
}

export function avatarUploadKey(userId: string): string {
  return `avatars/uploads/${userId}`;
}

export function avatarObjectKey(userId: string): string {
  return `avatars/${userId}`;
}

export function avatarPublicUrl(userId: string, version: string): string {
  return `/api/users/${userId}/avatar?v=${version}`;
}

const UPLOADED_AVATAR_PREFIX = "/api/users/";

export function isUploadedAvatarUrl(url: string | null): boolean {
  return url?.startsWith(UPLOADED_AVATAR_PREFIX);
}
