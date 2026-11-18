import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import { decryptToken, encryptToken } from "../crypto";

const credentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export type AgenticCredentials = z.infer<typeof credentialsSchema>;

export function encryptAgenticCredentials({ clientId, clientSecret }: AgenticCredentials): Buffer {
  return encryptToken(JSON.stringify({ clientId, clientSecret }));
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function decryptAgenticCredentials(packed: Buffer): Result<AgenticCredentials, AppError> {
  const plain = decryptToken(packed);
  if (!plain.ok) return plain;
  const parsed = credentialsSchema.safeParse(parseJson(plain.value));
  if (!parsed.success) {
    return err(new AppError(ERROR_IDS.AINBOX_AUTH_FAILED, "agentic inbox credentials unreadable"));
  }
  return ok(parsed.data);
}
