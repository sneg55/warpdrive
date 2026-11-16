import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xAccounts } from "@/db/schema/xDms";
import { encryptToken } from "@/features/email/crypto";
import { ok } from "@/types/result";
import type { ChatKeyUnlocker } from "./juicebox";
import type { XPublicKey } from "./types";

export const sig = () => new AbortController().signal;
export const PASSCODE = "424242-secret-passcode";

export function publicKey(
  version: string,
  juiceboxConfig: unknown = { token_map: [] },
): XPublicKey {
  return {
    version,
    identityPublicKey: "id",
    signingPublicKey: "sig",
    identityPublicKeySignature: "sigsig",
    juiceboxConfig,
  };
}

export function fakeUnlocker(blob = new Uint8Array([1, 2, 3, 4, 5])) {
  const calls: Array<{ juiceboxConfig: unknown; passcode: string }> = [];
  const unlocker: ChatKeyUnlocker = {
    unlock: (a) => {
      calls.push({ juiceboxConfig: a.juiceboxConfig, passcode: a.passcode });
      return Promise.resolve(ok(blob));
    },
  };
  return { unlocker, calls };
}

export async function seedAccount(db: Db): Promise<string> {
  const [row] = await db
    .insert(xAccounts)
    .values({
      xUserId: `x-${Math.random().toString(36).slice(2)}`,
      username: "brand",
      displayName: "Brand",
      refreshTokenEnc: encryptToken("refresh-1"),
    })
    .returning({ id: xAccounts.id });
  if (!row) throw new AppError(ERROR_IDS.X_ACCOUNT_NOT_FOUND, "seed failed", {});
  return row.id;
}
