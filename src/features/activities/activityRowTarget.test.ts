import { describe, expect, it } from "vitest";
import type { ActivityTableRow } from "./activityRows";
import { activityRowTarget } from "./activityRowTarget";

function row(overrides: Partial<ActivityTableRow>): ActivityTableRow {
  return {
    id: "a1",
    subject: "Call Jane",
    typeKey: "call",
    priority: null,
    done: false,
    dueAtIso: null,
    allDay: false,
    dealId: null,
    dealTitle: null,
    leadId: null,
    leadTitle: null,
    personId: null,
    personName: null,
    personEmail: null,
    personPhone: null,
    orgId: null,
    orgName: null,
    durationMinutes: null,
    assigneeId: "u1",
    assigneeName: "",
    ownerName: "",
    ...overrides,
  } as ActivityTableRow;
}

describe("activityRowTarget", () => {
  it("opens the deal when the activity is linked to one", () => {
    const t = activityRowTarget(row({ dealId: "d1", dealTitle: "Acme renewal" }));
    expect(t).toEqual({
      kind: "record",
      href: "/deals/d1",
      preview: { id: "d1", title: "Acme renewal", subtitle: "Call Jane" },
    });
  });

  it("opens the lead when the activity belongs to one", () => {
    // activities.lead_id and deal_id are mutually exclusive (activity_single_parent), so a lead
    // activity has no deal; it must not fall through to the lead's own contact.
    const t = activityRowTarget(
      row({ leadId: "l1", leadTitle: "Acme inbound", personId: "p1", personName: "Jane Roe" }),
    );
    expect(t).toEqual({
      kind: "record",
      href: "/leads/l1",
      preview: { id: "l1", title: "Acme inbound", subtitle: "Call Jane" },
    });
  });

  it("skips a soft-deleted lead the same way it skips a soft-deleted deal", () => {
    const t = activityRowTarget(
      row({ leadId: "gone", leadTitle: null, personId: "p1", personName: "Jane Roe" }),
    );
    expect(t.kind === "record" && t.href).toBe("/contacts/people/p1");
  });

  it("falls back to the person when there is no deal", () => {
    const t = activityRowTarget(row({ personId: "p1", personName: "Jane Roe" }));
    expect(t).toEqual({
      kind: "record",
      href: "/contacts/people/p1",
      preview: { id: "p1", title: "Jane Roe", subtitle: "Call Jane" },
    });
  });

  it("falls back to the organization when there is no deal and no person", () => {
    const t = activityRowTarget(row({ orgId: "o1", orgName: "Acme Inc" }));
    expect(t).toEqual({
      kind: "record",
      href: "/contacts/orgs/o1",
      preview: { id: "o1", title: "Acme Inc", subtitle: "Call Jane" },
    });
  });

  it("prefers the deal over the person and organization", () => {
    const t = activityRowTarget(
      row({
        dealId: "d1",
        dealTitle: "Acme renewal",
        personId: "p1",
        personName: "Jane Roe",
        orgId: "o1",
        orgName: "Acme Inc",
      }),
    );
    expect(t.kind === "record" && t.href).toBe("/deals/d1");
  });

  it("skips a soft-deleted deal, whose title the visibility-filtered join leaves null", () => {
    const t = activityRowTarget(
      row({ dealId: "gone", dealTitle: null, personId: "p1", personName: "Jane Roe" }),
    );
    expect(t.kind === "record" && t.href).toBe("/contacts/people/p1");
  });

  it("edits the activity itself when it is linked to no record at all", () => {
    expect(activityRowTarget(row({}))).toEqual({ kind: "edit" });
  });

  it("still opens a record whose name the row did not carry", () => {
    const t = activityRowTarget(row({ personId: "p1", personName: null }));
    expect(t).toEqual({
      kind: "record",
      href: "/contacts/people/p1",
      preview: { id: "p1", title: "Contact", subtitle: "Call Jane" },
    });
  });
});
