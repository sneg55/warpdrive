export const LABEL_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "magenta",
  "gray",
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export const LABEL_TARGETS = ["deal", "person", "organization", "lead"] as const;
export type LabelTarget = (typeof LABEL_TARGETS)[number];

// Single source of truth mapping each label color to its Tailwind chip classes. Every surface
// that renders a label (settings picker, deal cards, contact/org headers) reads from here so a
// color always looks the same. Full literal class strings so Tailwind's scanner keeps them.
export const LABEL_COLOR_CLASSES: Record<LabelColor, string> = {
  red: "bg-red-100 text-red-800 border-red-200",
  orange: "bg-orange-100 text-orange-800 border-orange-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  green: "bg-green-100 text-green-800 border-green-200",
  teal: "bg-teal-100 text-teal-800 border-teal-200",
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  magenta: "bg-pink-100 text-pink-800 border-pink-200",
  gray: "bg-gray-100 text-gray-800 border-gray-200",
};

// Solid hex per label color, for surfaces that paint an inline background (the deal board card
// chips use white text on a saturated fill rather than the light class chips).
export const LABEL_COLOR_HEX: Record<LabelColor, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  teal: "#14b8a6",
  blue: "#3b82f6",
  purple: "#a855f7",
  magenta: "#ec4899",
  gray: "#9ca3af",
};

// Saturated swatch classes for a solid color dot (label pickers + the settings color dropdown).
// Full literal strings so Tailwind's scanner keeps them.
export const LABEL_DOT_CLASSES: Record<LabelColor, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  magenta: "bg-pink-500",
  gray: "bg-gray-400",
};
