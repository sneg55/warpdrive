import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/config/env";
import { AppError } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";

// Decode once at module load; throws at import time if key is invalid (single env boundary).
const KEY = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");

const IV_LEN = 12; // GCM standard nonce length
const TAG_LEN = 16; // AES-GCM auth tag length

/**
 * Encrypt a token string with AES-256-GCM using a fresh random IV per call.
 * Packed layout: iv(12) || authTag(16) || ciphertext
 * The returned Buffer maps directly to a bytea column; never log it.
 */
export function encryptToken(plaintext: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

/**
 * Decrypt a packed buffer produced by encryptToken.
 * Returns err(AppError E_GMAIL_005) on auth-tag mismatch (tamper) or malformed input.
 * This is a server-side key/data problem, NOT an OAuth grant revocation, so it must
 * never trigger mailbox disconnection. Never throws; never logs plaintext or key.
 */
export function decryptToken(packed: Buffer): Result<string, AppError> {
  try {
    // A valid packed token is at least iv(12) + authTag(16) bytes; reject shorter input
    // up front so we never hand a truncated tag to the decipher.
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
    // Auth tag mismatch or malformed input. Do NOT include any token bytes in context.
    return err(new AppError("E_GMAIL_005", "token decryption failed: auth tag mismatch", {}));
  }
}
