import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { oauthClients } from "@/db/schema/oauth";

export const clientRegistrationInput = z.object({
  client_name: z.string().min(1).optional(),
  redirect_uris: z.array(z.string().url()).min(1),
});

interface RegisterClientInput {
  name: string;
  redirectUris: string[];
}

export async function registerClient(
  db: Db,
  input: RegisterClientInput,
  signal: AbortSignal,
): Promise<{ clientId: string }> {
  signal.throwIfAborted();
  const clientId = randomUUID();
  await db.insert(oauthClients).values({ id: clientId, ...input });
  signal.throwIfAborted();
  return { clientId };
}

export async function getClient(db: Db, clientId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId));
  signal.throwIfAborted();
  return client;
}
