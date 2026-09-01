// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { ConvertLeadDialog } from "./ConvertLeadDialog";

afterEach(cleanup);

const grade: CustomFieldDef = {
  id: "cf-grade",
  targetEntity: "deal",
  type: "text",
  name: "Grade",
  key: "grade",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: true,
  order: 0,
  archivedAt: null,
};

it("opens prefilled with initialValues and submits them merged with edits", async () => {
  const onConvert = vi.fn(() => Promise.resolve(true));
  render(
    <ConvertLeadDialog
      defs={[grade]}
      initialValues={{ grade: "A" }}
      onClose={() => {}}
      onConvert={onConvert}
    />,
  );
  expect(screen.getByLabelText("Grade")).toHaveValue("A");
  fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "B" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onConvert).toHaveBeenCalledWith({ grade: "B" }));
});

it("leaves a carried value it never rendered out of the payload", async () => {
  const onConvert = vi.fn(() => Promise.resolve(true));
  render(
    <ConvertLeadDialog
      defs={[
        grade,
        { ...grade, id: "cf-hidden", key: "hidden", name: "Hidden", showInAddForm: false },
      ]}
      initialValues={{ grade: "A", hidden: "keep" }}
      onClose={() => {}}
      onConvert={onConvert}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onConvert).toHaveBeenCalledWith({ grade: "A" }));
});

it("submits an explicit null when a prefilled value is cleared", async () => {
  const onConvert = vi.fn(() => Promise.resolve(true));
  render(
    <ConvertLeadDialog
      defs={[grade]}
      initialValues={{ grade: "A" }}
      onClose={() => {}}
      onConvert={onConvert}
    />,
  );
  fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onConvert).toHaveBeenCalledWith({ grade: null }));
});
