import { describe, expect, it } from "vitest";
import { parsePersonPatch } from "./personPatchGuard";

const ID = "11111111-1111-4111-8111-111111111111";
const point = (value: string) => ({ label: "work", value, primary: false });

describe("parsePersonPatch", () => {
  it("lets through an address the record already holds, however malformed", () => {
    const r = parsePersonPatch(ID, { emails: [point("broken@")] }, ["broken@"]);
    expect(r.ok).toBe(true);
    expect(r.value?.emails?.map((e) => e.value)).toEqual(["broken@"]);
  });

  it("refuses an address the write is introducing", () => {
    expect(parsePersonPatch(ID, { emails: [point("also-broken@")] }, ["broken@"]).ok).toBe(false);
  });

  // The plan folds an address before deciding it is already on the record. If this fold differed,
  // a value the run supplied could arrive spelled like a stored one and skip the address rule.
  it("folds case and surrounding space the same way the plan does", () => {
    expect(parsePersonPatch(ID, { emails: [point("Broken@")] }, [" broken@ "]).ok).toBe(true);
  });

  it("still bounds the length of an address it does not check for shape", () => {
    const long = `${"x".repeat(400)}@`;
    expect(parsePersonPatch(ID, { emails: [point(long)] }, [long]).ok).toBe(false);
  });

  it("keeps validating everything outside the emails array", () => {
    expect(parsePersonPatch(ID, { orgId: "not-a-uuid" }, []).ok).toBe(false);
  });

  it("passes a patch that carries no emails straight through", () => {
    const r = parsePersonPatch(ID, { name: "Nick" }, []);
    expect(r.ok).toBe(true);
    expect(r.value?.name).toBe("Nick");
  });
});
