export const MARKETING_STRINGS = {
  source: "Brevo campaign",
  status: {
    delivered: "Delivered",
    opened: "Opened",
    clicked: "Clicked",
    softBounce: "Soft bounce",
    hardBounce: "Hard bounce",
    complaint: "Spam complaint",
    unsubscribed: "Unsubscribed",
  },
  clickedLinks: (n: number): string => (n === 1 ? "Clicked link (1)" : `Clicked links (${n})`),
  truncated: (limit: number): string => `Showing the latest ${limit} campaigns`,
} as const;
