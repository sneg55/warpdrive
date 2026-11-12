export const SUPPORT_STRINGS = {
  untitled: "Support conversation",
  source: "Intercom",
  states: {
    open: "Open",
    closed: "Closed",
    snoozed: "Snoozed",
  } as Record<string, string>,
  messageCount: (n: number): string => (n === 1 ? "1 message" : `${n} messages`),
  lastReplyBy: (name: string): string => `Last reply by ${name}`,
  unknownAuthor: "Unknown",
  expand: "Show conversation",
  collapse: "Hide conversation",
  loading: "Loading conversation…",
  loadFailed: "Couldn't load this conversation.",
  retry: "Retry",
  frameTitle: "support conversation",
} as const;
