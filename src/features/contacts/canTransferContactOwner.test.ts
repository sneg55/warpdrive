import { expect, it } from "vitest";
import type { PermSetUser } from "@/features/permissions/effective";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import { canTransferContactOwner } from "./resolveOwnerUpdate";

// codex final review P2: the owner dropdown must not appear for a user who can reassign owner
// (deal.changeOwner) but cannot edit the contact (contact.edit), because updatePerson/updateOrg
// reject at the contact.edit gate first, so the control would silently do nothing.

function user(flags: string[]): PermSetUser {
  return {
    id: "u1",
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(flags),
  } as PermSetUser;
}

const record: VisiblePersonOrOrg = {
  kind: "person",
  ownerId: "owner-x",
  visibilityLevel: "all",
  visibilityGroupId: null,
  visibleToUserIds: [],
};

it("is false when the actor can change owner but lacks contact.edit", () => {
  expect(canTransferContactOwner(user(["deal.changeOwner_any"]), record)).toBe(false);
});

it("is true when the actor can both change owner and edit the contact", () => {
  expect(canTransferContactOwner(user(["deal.changeOwner_any", "contact.edit_any"]), record)).toBe(
    true,
  );
});

it("is false when the actor can edit but cannot change owner", () => {
  expect(canTransferContactOwner(user(["contact.edit_any"]), record)).toBe(false);
});
