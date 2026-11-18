import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/config/env";
import { AppError } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";

const KEY = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");

const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptToken(plaintext: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function decryptToken(packed: Buffer): Result<string, AppError> {
  try {
    if (packed.length < IV_LEN + TAG_LEN) {
      return err(new AppError("E_GMAIL_005", "token decryption failed: input too short", {}));
    }
    const iv = packed.subarray(0, IV_LEN);
    const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = packed.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv, { authTagLength: TAG_LEN });
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return ok(pt.toString("utf8"));
  } catch {
    return err(new AppError("E_GMAIL_005", "token decryption failed: auth tag mismatch", {}));
  }
}
