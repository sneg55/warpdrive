// Day / Night / System. "system" is the default so a fresh account follows the OS.
export const APPEARANCE_VALUES = ["day", "night", "system"] as const;
export type Appearance = (typeof APPEARANCE_VALUES)[number];
export const APPEARANCE_DEFAULT: Appearance = "system";

// The resolved choice is mirrored into a cookie so the inline no-flash script (and any server
// render) can settle the theme before first paint. user_preferences.ui.appearance stays the
// durable, cross-device record.
export const APPEARANCE_COOKIE = "wd_appearance";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

// globals.css binds `dark:` to this class (`@custom-variant dark (&:is(.dark *))`).
export const DARK_CLASS = "dark";

// Deliberately not a zod schema: the root layout mounts AppearanceSync, so anything imported here
// ships on every route, and three literals do not justify the parser (see lib/isValidEmail.ts).
export function parseAppearance(value: string | null | undefined): Appearance {
  const known = APPEARANCE_VALUES.find((v) => v === value);
  return known ?? APPEARANCE_DEFAULT;
}

export function readAppearanceCookie(cookieString: string): Appearance {
  const match = new RegExp(`(?:^|;\\s*)${APPEARANCE_COOKIE}=([^;]*)`).exec(cookieString);
  return parseAppearance(match?.[1]);
}

export function appearanceCookieValue(value: Appearance): string {
  return `${APPEARANCE_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function isDarkAppearance(value: Appearance, prefersDark: boolean): boolean {
  if (value === "day") return false;
  if (value === "night") return true;
  return prefersDark;
}

export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

// Inlined at the top of <body> so the class lands before the first paint. Kept as one dependency
// free expression: it runs before any bundle has loaded. A browser that denies cookies or lacks
// matchMedia falls through to the light palette, which is the safe default. // silent-ok
export function appearanceScript(): string {
  const body = `var m=document.cookie.match(/(?:^|;\\s*)${APPEARANCE_COOKIE}=([^;]*)/);var p=m?m[1]:"${APPEARANCE_DEFAULT}";var d=p==="night"||(p!=="day"&&matchMedia("${PREFERS_DARK_QUERY}").matches);document.documentElement.classList.toggle("${DARK_CLASS}",d);`;
  return `(function(){try{${body}}catch(e){void 0;}})();`;
}

// The authenticated counterpart, emitted by the app shell once the account's stored choice is
// known. It reconciles this device's cookie with that choice inline, so a cold browser or another
// account's leftover cookie never gets a frame of the wrong theme. The value is one of three
// literals, resolved through parseAppearance, so nothing caller-supplied reaches the source.
export function appearanceSeedScript(stored: Appearance): string {
  const value = parseAppearance(stored);
  const body = `document.cookie="${APPEARANCE_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax";var d="${value}"==="night"||("${value}"!=="day"&&matchMedia("${PREFERS_DARK_QUERY}").matches);document.documentElement.classList.toggle("${DARK_CLASS}",d);`;
  return `(function(){try{${body}}catch(e){void 0;}})();`;
}
