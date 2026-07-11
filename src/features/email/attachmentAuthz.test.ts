// Security tests for attachment authorization in resolveAttachments (sendHelpers.ts).
// Previously the actor was hardcoded as { type: "regular", groupIds: new Set() },
// which denied admins and group members who should be allowed.
// These tests prove the real actor type and groupIds flow through correctly.

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { seedAccount, seedReadyFile } from "./attachmentSend.helpers";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail } from "./send";

describe("resolveAttachments actor authz (Phase 6 security)", () => {
  it("an admin actor can attach a file on an entity they do not own (admin bypass)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "file-owner@gunsnation.com" });
      const admin = await seedUser(db, { email: "admin@gunsnation.com", isAdmin: true });
      const adminAcctId = await seedAccount(db, admin.id, "admin@gunsnation.com");

      const { randomUUID } = await import("node:crypto");
      const personId = randomUUID();
      // owner-only visibility: a regular non-owner would be denied.
      await db.execute(sql`
        INSERT INTO persons (id, name, owner_id, visibility_level)
        VALUES (${personId}, 'Owned Person', ${owner.id}, 'owner')
      `);

      const storage = new FakeStorageClient();
      const { fileId } = await seedReadyFile(db, {
        uploadedBy: owner.id,
        entityType: "person",
        entityId: personId,
        filename: "admin-access.pdf",
        contentType: "application/pdf",
        content: Buffer.from("admin-bytes"),
        storage,
      });

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-admin-attach", threadId: "th-admin" });
      fake.messages.set("g-admin-attach", {
        id: "g-admin-attach",
        threadId: "th-admin",
        labelIds: [],
      });

      const r = await sendEmail(db, {
        actorId: admin.id,
        actorType: "admin",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage,
        input: {
          accountId: adminAcctId,
          idempotencyKey: "d4d4d4d4-0000-0000-0000-000000000004",
          to: ["r@x.com"],
          subject: "Admin attach",
          bodyHtml: "<p>admin</p>",
          trackingEnabled: false,
          attachments: [{ fileId }],
        },
      });

      // Admin bypass must allow the send even though the entity is owner-only.
      expect(r.ok).toBe(true);
    });
  });

  it("a regular user who is a member of the file entity visibility group is allowed", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "vg-owner@gunsnation.com" });

      const { randomUUID } = await import("node:crypto");
      const groupId = randomUUID();
      await db.execute(
        sql`INSERT INTO visibility_groups (id, name) VALUES (${groupId}, 'test-group')`,
      );

      const member = await seedUser(db, { email: "member@gunsnation.com" });
      await db.execute(sql`
        INSERT INTO visibility_group_members (group_id, user_id) VALUES (${groupId}, ${member.id})
      `);
      const memberAcctId = await seedAccount(db, member.id, "member@gunsnation.com");

      const personId = randomUUID();
      // group visibility: only members of groupId can see it.
      await db.execute(sql`
        INSERT INTO persons (id, name, owner_id, visibility_level, visibility_group_id)
        VALUES (${personId}, 'Group Person', ${owner.id}, 'group', ${groupId})
      `);

      const storage = new FakeStorageClient();
      const { fileId } = await seedReadyFile(db, {
        uploadedBy: owner.id,
        entityType: "person",
        entityId: personId,
        filename: "group-file.pdf",
        contentType: "application/pdf",
        content: Buffer.from("group-bytes"),
        storage,
      });

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-group-attach", threadId: "th-group" });
      fake.messages.set("g-group-attach", {
        id: "g-group-attach",
        threadId: "th-group",
        labelIds: [],
      });

      const r = await sendEmail(db, {
        actorId: member.id,
        actorType: "regular",
        // Pass the real group membership so canSee grants access.
        actorGroupIds: new Set<string>([groupId]),
        gmail: fake,
        storage,
        input: {
          accountId: memberAcctId,
          idempotencyKey: "e5e5e5e5-0000-0000-0000-000000000005",
          to: ["r@x.com"],
          subject: "Group member attach",
          bodyHtml: "<p>member</p>",
          trackingEnabled: false,
          attachments: [{ fileId }],
        },
      });

      // Group member must be granted access.
      expect(r.ok).toBe(true);
    });
  });
});
