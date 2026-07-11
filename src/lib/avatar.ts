// Initials + deterministic accent for contact/owner avatars. Kept as pure
// helpers so the visual Avatar component stays declarative and the logic is
// unit-tested. Colors use semantic-ish Tailwind pairs (bg + text) from a fixed
// palette; a name always maps to the same swatch.

export const AVATAR_PALETTE = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
] as const;

export type AvatarColorClass = (typeof AVATAR_PALETTE)[number];

// First letter of the first two words, uppercased. "?" when there is nothing.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

// Deterministic swatch: sum char codes, modulo palette length.
export function avatarColorClass(seed: string): AvatarColorClass {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0];
}
