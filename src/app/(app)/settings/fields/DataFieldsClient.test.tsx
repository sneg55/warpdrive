// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const actions = vi.hoisted(() => ({
  createDefAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "new" } })),
  archiveDefAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "d1" } })),
  renameDefAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "d1" } })),
  reorderDefsAction: vi.fn(() => Promise.resolve({ ok: true as const })),
  addOptionAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "p1" } })),
  renameOptionAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "p1" } })),
  archiveOptionAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "p1" } })),
  setBuiltinFieldHiddenAction: vi.fn(() => Promise.resolve({ ok: true as const })),
}));
vi.mock("@/features/custom-fields/actions", () => actions);

const BUILTIN_BY_TARGET = {
  deal: [
    { key: "title", label: "Title", locked: true, hidden: false },
    { key: "value", label: "Value", locked: false, hidden: false },
  ],
  person: [{ key: "name", label: "Name", locked: true, hidden: false }],
  organization: [{ key: "industry", label: "Industry", locked: false, hidden: true }],
  activity: [],
};

import { DataFieldsClient } from "./DataFieldsClient";

const BY_TARGET = {
  deal: [
    {
      id: "d1",
      name: "Budget",
      type: "monetary",
      options: [],
      isImportant: false,
      showInAddForm: false,
    },
  ],
  person: [
    {
      id: "p1",
      name: "Priority",
      type: "single_option",
      options: [
        { id: "o1", label: "Low" },
        { id: "o2", label: "Retired", archived: true },
      ],
      isImportant: false,
      showInAddForm: false,
    },
  ],
  organization: [
    {
      id: "g1",
      name: "Region",
      type: "text",
      options: [],
      isImportant: false,
      showInAddForm: false,
    },
    {
      id: "g2",
      name: "Segment",
      type: "text",
      options: [],
      isImportant: false,
      showInAddForm: false,
    },
  ],
  activity: [],
};

function chooseSelect(label: string, option: string): void {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

describe("DataFieldsClient", () => {
  it("lists fields for the selected entity", () => {
    render(<DataFieldsClient byTarget={BY_TARGET} />);
    // "monetary" also appears as a type-select option, so scope to the row.
    expect(screen.getByText("Budget").closest("li")).toHaveTextContent("monetary");
  });

  it("lists built-in fields above the custom fields, with a badge and a toggle", () => {
    render(
      <DataFieldsClient
        byTarget={BY_TARGET}
        builtinByTarget={BUILTIN_BY_TARGET}
        initialTarget="organization"
      />,
    );
    // The built-in Industry row shows with a Built-in badge...
    expect(screen.getByText("Industry").closest("li")).toHaveTextContent("Built-in");
    // ...and a Hidden switch (reflecting its hidden=true state).
    expect(screen.getByRole("switch", { name: /Hidden: Industry/i })).toBeInTheDocument();
    // The custom field (Region) still renders below.
    expect(screen.getByText("Region")).toBeInTheDocument();
  });

  it("shows no toggle for a locked built-in field", () => {
    render(
      <DataFieldsClient
        byTarget={BY_TARGET}
        builtinByTarget={BUILTIN_BY_TARGET}
        initialTarget="deal"
      />,
    );
    const titleRow = screen.getByText("Title").closest("li");
    expect(titleRow).toHaveTextContent("Always shown");
    expect(screen.getByRole("switch", { name: /Hidden: Value/i })).toBeInTheDocument();
  });

  it("opens the entity given by initialTarget (from ?entity=), not always deal", () => {
    render(<DataFieldsClient byTarget={BY_TARGET} initialTarget="person" />);
    // Person fields active: "Priority" is a person field; the deal "Budget" is not shown.
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.queryByText("Budget")).not.toBeInTheDocument();
  });

  it("archives a field via archiveDefAction", async () => {
    render(<DataFieldsClient byTarget={BY_TARGET} />);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(actions.archiveDefAction).toHaveBeenCalledWith({ id: "d1" }, "csrf"),
    );
  });

  it("creates a field via createDefAction with the selected target and type", async () => {
    render(<DataFieldsClient byTarget={BY_TARGET} />);
    fireEvent.change(screen.getByLabelText("Field name"), { target: { value: "Region" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    await waitFor(() =>
      expect(actions.createDefAction).toHaveBeenCalledWith(
        expect.objectContaining({ targetEntity: "deal", type: "text", name: "Region" }),
        "csrf",
      ),
    );
  });

  it("renames a field via renameDefAction (name only)", async () => {
    render(<DataFieldsClient byTarget={BY_TARGET} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Rename"), { target: { value: "Deal size" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(actions.renameDefAction).toHaveBeenCalledWith({ id: "d1", name: "Deal size" }, "csrf"),
    );
  });

  it("renders a drag handle per row so fields can be reordered", () => {
    render(<DataFieldsClient byTarget={BY_TARGET} />);
    chooseSelect("Entity", "Organization");
    expect(screen.getAllByRole("button", { name: "Drag to reorder" })).toHaveLength(2);
  });

  it("adds an option via addOptionAction from the option editor", async () => {
    render(<DataFieldsClient byTarget={BY_TARGET} />);
    chooseSelect("Entity", "Person");
    fireEvent.click(screen.getByRole("button", { name: "Edit options" }));
    fireEvent.change(screen.getByLabelText("New option"), { target: { value: "Medium" } });
    fireEvent.click(screen.getByRole("button", { name: "Add option" }));
    await waitFor(() =>
      expect(actions.addOptionAction).toHaveBeenCalledWith({ id: "p1", label: "Medium" }, "csrf"),
    );
  });

  it("removes an active option via archiveOptionAction (never a hard-delete)", async () => {
    render(<DataFieldsClient byTarget={BY_TARGET} />);
    chooseSelect("Entity", "Person");
    fireEvent.click(screen.getByRole("button", { name: "Edit options" }));
    // Only the active option ("Low") has a Remove button; the archived one shows a tag.
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(actions.archiveOptionAction).toHaveBeenCalledWith(
        { id: "p1", optionId: "o1" },
        "csrf",
      ),
    );
  });
});
