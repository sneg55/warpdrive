// Browser-safe public environment values.
// Only NEXT_PUBLIC_* variables belong here: Next.js inlines them at build time
// so they never require node:fs and are safe to import in "use client" modules.
// The server-only boundary (src/config/env.ts) must NOT be imported from client code.

export const clientEnv = {
  // WebSocket server URL visible to the browser. Set NEXT_PUBLIC_WS_URL in .env.
  WS_PUBLIC_URL: process.env.NEXT_PUBLIC_WS_URL ?? "",
} as const;
