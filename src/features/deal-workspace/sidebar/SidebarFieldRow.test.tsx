// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SidebarFieldRow } from "./SidebarFieldRow";
import { HideEmptyContext } from "./sectionFilter";

afterEach(cleanup);

const textEditor = ({ draft, setDraft }: { draft: string; setDraft: (v: string) => void }) => (
  <input aria-label="editor" value={draft} onChange={(e) => setDraft(e.target.value)} />
);

it("edits ONLY via the pencil; the value itself is not a click target", () => {
  render(
    <SidebarFieldRow label="Website" value="acme.com" renderEditor={textEditor} onSave={vi.fn()} />,
  );
  fireEvent.click(screen.getByText("acme.com"));
  expect(screen.queryByLabelText("editor")).not.toBeInTheDocument();
  expect(screen.getByText("acme.com").closest("button")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit Website" }));
  expect(screen.getByLabelText("editor")).toBeInTheDocument();
});

it("dirty-gates Save, then Save calls onSave with the draft and exits", async () => {
  const onSave = vi.fn(() => Promise.resolve({ ok: true }));
  render(
    <SidebarFieldRow
      label="Website"
      value="-"
      initialDraft=""
      renderEditor={textEditor}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit Website" }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("editor"), { target: { value: "acme.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith("acme.com"));
  await vi.waitFor(() => expect(screen.queryByLabelText("editor")).not.toBeInTheDocument());
});

it("Cancel discards without calling onSave", () => {
  const onSave = vi.fn(() => Promise.resolve({ ok: true }));
  render(<SidebarFieldRow label="Website" value="-" renderEditor={textEditor} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Website" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("editor")).not.toBeInTheDocument();
});

it("keeps the editor open and shows an error when save fails", async () => {
  const onSave = vi.fn(() => Promise.resolve({ ok: false }));
  render(<SidebarFieldRow label="Website" value="-" renderEditor={textEditor} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Website" }));
  fireEvent.change(screen.getByLabelText("editor"), { target: { value: "acme.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByLabelText("editor")).toBeInTheDocument();
});

it("readOnly renders no edit affordance", () => {
  render(<SidebarFieldRow label="Deal age" value="4 days" readOnly />);
  expect(screen.queryByRole("button", { name: "Edit Deal age" })).not.toBeInTheDocument();
});

it("stays visible when empty but the section is not hiding empties", () => {
  render(
    <HideEmptyContext.Provider value={false}>
      <SidebarFieldRow label="Website" value="-" readOnly empty />
    </HideEmptyContext.Provider>,
  );
  expect(screen.getByText("Website")).toBeInTheDocument();
});

it("self-hides when empty and the section is hiding empties", () => {
  render(
    <HideEmptyContext.Provider value={true}>
      <SidebarFieldRow label="Website" value="-" readOnly empty />
    </HideEmptyContext.Provider>,
  );
  expect(screen.queryByText("Website")).not.toBeInTheDocument();
});
