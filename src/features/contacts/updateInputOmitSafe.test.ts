import { expect, it } from "vitest";
import { orgUpdateInput, personUpdateInput } from "./schemas";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";

it("personUpdateInput leaves omitted fields undefined (no default clobber)", () => {
  const parsed = personUpdateInput.parse({ id: PERSON_ID, ownerId: OWNER_ID });
  expect(parsed.emails).toBeUndefined();
  expect(parsed.phones).toBeUndefined();
  expect(parsed.orgId).toBeUndefined();
  expect(parsed.customFields).toBeUndefined();
});

it("orgUpdateInput leaves omitted fields undefined (no default clobber)", () => {
  const parsed = orgUpdateInput.parse({ id: PERSON_ID, ownerId: OWNER_ID });
  expect(parsed.address).toBeUndefined();
  expect(parsed.customFields).toBeUndefined();
});
