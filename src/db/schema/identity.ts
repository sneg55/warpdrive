import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { PermissionFlagKey } from "@/constants/permissionFlags";

// citext for case-insensitive unique email/name dedup (data-model 19; extension created in migration).
export const citext = customType<{ data: string }>({ dataType: () => "citext" });

export const visibilityLevelEnum = pgEnum("visibility_level", ["owner", "group", "all"]);

// permission_sets.flags is a validated jsonb map of flag -> boolean.
function jsonbFlags(name: string) {
  return jsonb(name).$type<Partial<Record<PermissionFlagKey, boolean>>>();
}

export const permissionSets = pgTable(
  "permission_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    flags: jsonbFlags("flags").notNull().default(sql`'{}'::jsonb`),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("permission_sets_name_uq").on(t.name)],
);

export const visibilityGroups = pgTable(
  "visibility_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("visibility_groups_name_uq").on(t.name)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: citext("email").notNull().unique(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    // Nullable: an invited placeholder has no Google identity yet (bound on first login,
    // see auth/bootstrap.ts). Unique still holds for non-null values (Postgres allows
    // multiple NULLs under a unique constraint).
    googleSub: text("google_sub").unique(),
    isAdmin: boolean("is_admin").notNull().default(false),
    permissionSetId: uuid("permission_set_id").references(() => permissionSets.id),
    primaryVisibilityGroupId: uuid("primary_visibility_group_id").references(
      () => visibilityGroups.id,
    ),
    isActive: boolean("is_active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    // Set when a user row is created via inviteUser (pre-authorized, no login yet) and
    // cleared when the invited placeholder is adopted on first Google login.
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("users_permission_set_idx").on(t.permissionSetId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  managerId: uuid("manager_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const visibilityGroupMembers = pgTable(
  "visibility_group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => visibilityGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("vgm_user_idx").on(t.userId),
    index("vgm_group_idx").on(t.groupId),
  ],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type PermissionSet = typeof permissionSets.$inferSelect;
export type VisibilityGroup = typeof visibilityGroups.$inferSelect;
