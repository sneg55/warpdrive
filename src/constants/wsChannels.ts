// Channel name builders (no magic strings at call sites).
export const wsChannel = {
  pipeline: (id: string) => `pipeline:${id}` as const,
  deal: (id: string) => `deal:${id}` as const,
  user: (id: string) => `user:${id}` as const,
  importBatch: (id: string) => `import:${id}` as const,
};

export type WsChannelFamily = "pipeline" | "deal" | "user" | "import";

// Parse "family:id"; returns null on a malformed channel string.
export function parseChannel(channel: string): { family: WsChannelFamily; id: string } | null {
  const idx = channel.indexOf(":");
  if (idx <= 0) return null;
  const family = channel.slice(0, idx);
  const id = channel.slice(idx + 1);
  if (family !== "pipeline" && family !== "deal" && family !== "user" && family !== "import") {
    return null;
  }
  if (id.length === 0) return null;
  return { family, id };
}
