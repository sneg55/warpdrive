export const APPEARANCE_VALUES = ["day", "night", "system"] as const;
export type Appearance = (typeof APPEARANCE_VALUES)[number];
export const APPEARANCE_DEFAULT: Appearance = "system";

export const APPEARANCE_COOKIE = "wd_appearance";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const DARK_CLASS = "dark";

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

export function appearanceScript(): string {
  const body = `var m=document.cookie.match(/(?:^|;\\s*)${APPEARANCE_COOKIE}=([^;]*)/);var p=m?m[1]:"${APPEARANCE_DEFAULT}";var d=p==="night"||(p!=="day"&&matchMedia("${PREFERS_DARK_QUERY}").matches);document.documentElement.classList.toggle("${DARK_CLASS}",d);`;
  return `(function(){try{${body}}catch(e){void 0;}})();`;
}

export function appearanceSeedScript(stored: Appearance): string {
  const value = parseAppearance(stored);
  const body = `document.cookie="${APPEARANCE_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax";var d="${value}"==="night"||("${value}"!=="day"&&matchMedia("${PREFERS_DARK_QUERY}").matches);document.documentElement.classList.toggle("${DARK_CLASS}",d);`;
  return `(function(){try{${body}}catch(e){void 0;}})();`;
}
