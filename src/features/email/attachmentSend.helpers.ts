// Shared test helpers for attachment send integration tests.
// Exported so attachmentSend.test.ts and attachmentAuthz.test.ts can both use them
// without duplication. Not part of the production API.

import { sql } from "drizzle-orm";
import { files } from "@/db/schema";
import type { withTestDb } from "@/db/testing";
import type { FakeStorageClient } from "../files/storageFake";

export type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

// Seed a "ready" file row directly (bypasses the presigned-upload handshake,
// which is already tested in the files suite). Registers bytes in the fake so
// getObjectBytes can serve them at send time.
export async function seedReadyFile(
  db: TestDb,
  opts: {
    uploadedBy: string;
    entityType: "deal" | "person" | "organization" | "activity" | "email_message";
    entityId: string;
    filename: string;
    contentType: string;
    content: Buffer;
    storage: FakeStorageClient;
  },
): Promise<{ fileId: string; s3Key: string }> {
  const { randomUUID } = await import("node:crypto");
  const fileId = randomUUID();
  const s3Key = `confirmed/${opts.entityType}/${opts.entityId}/${fileId}/${opts.filename}`;

  await db.insert(files).values({
    id: fileId,
    entityType: opts.entityType,
    entityId: opts.entityId,
    filename: opts.filename,
    s3Key,
    sizeBytes: opts.content.length,
    contentType: opts.contentType,
    status: "ready",
    uploadedBy: opts.uploadedBy,
  });

  opts.storage.objectBytes.set(s3Key, opts.content);
  return { fileId, s3Key };
}

// Seed a connected email account for the given owner.
export async function seedAccount(
  db: TestDb,
  ownerId: string,
  email = "owner@gunsnation.com",
): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}
