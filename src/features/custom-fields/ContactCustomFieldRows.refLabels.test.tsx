// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/contacts/actions", () => ({ patchContactCustomFieldAction: vi.fn() }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { ContactCustomFieldRows } from "./ContactCustomFieldRows";
import { CustomFieldRefLabelsProvider } from "./refLabelsContext";

afterEach(cleanup);

it("shows the referenced user's name in a sidebar row", () => {
  const def = {
    id: "d",
    targetEntity: "person" as const,
    type: "user" as const,
    name: "Rep",
    key: "rep",
    options: [],
    isRequired: false,
    isImportant: false,
    showInAddForm: false,
    order: 0,
    archivedAt: null,
  };
  render(
    <CustomFieldRefLabelsProvider value={{ user: { u1: "Ada" }, person: {}, org: {} }}>
      <ContactCustomFieldRows
        contact={{ kind: "person", id: "p1", customFields: { rep: "u1" } }}
        defs={[def]}
        currency="USD"
      />
    </CustomFieldRefLabelsProvider>,
  );
  expect(screen.getByText("Ada")).not.toBeNull();
  expect(screen.queryByText("u1")).toBeNull();
});
