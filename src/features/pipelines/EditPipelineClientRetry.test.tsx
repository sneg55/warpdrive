// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type * as DndCore from "@dnd-kit/core";
import type * as DndSortable from "@dnd-kit/sortable";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const renamePipelineAction = vi.fn();
const createStageAction = vi.fn();
const updateStageAction = vi.fn();
const deleteStageAction = vi.fn();
const reorderStagesAction = vi.fn();
vi.mock("./pipelineEditActions", () => ({
  renamePipelineAction: (...args: unknown[]) => renamePipelineAction(...args),
  createStageAction: (...args: unknown[]) => createStageAction(...args),
  updateStageAction: (...args: unknown[]) => updateStageAction(...args),
  deleteStageAction: (...args: unknown[]) => deleteStageAction(...args),
  reorderStagesAction: (...args: unknown[]) => reorderStagesAction(...args),
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof DndCore>();
  return {
    ...actual,
    DndContext: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("@dnd-kit/sortable", async (importOriginal) => {
  const actual = await importOriginal<typeof DndSortable>();
  return {
    ...actual,
    SortableContext: ({ children }: { children: React.ReactNode }) => children,
    useSortable: () => ({
      attributes: {},
      listeners: undefined,
      setNodeRef: () => undefined,
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  };
});

import { EditPipelineClient } from "./EditPipelineClient";

const STAGES = [
  { id: "s1", name: "Lead in", rottingDays: null },
  { id: "s2", name: "Contacted", rottingDays: 7 },
  { id: "s3", name: "Won prep", rottingDays: null },
];

function renderEditor(): void {
  render(<EditPipelineClient pipelineId="p1" pipelineName="Sales" stages={STAGES} />);
}

function save(): void {
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
}

beforeEach(() => {
  renamePipelineAction.mockResolvedValue({ ok: true, value: { id: "p1", name: "Sales" } });
  createStageAction.mockResolvedValue({ ok: true, value: { id: "n1" } });
  updateStageAction.mockResolvedValue({ ok: true, value: { id: "s1" } });
  deleteStageAction.mockResolvedValue({ ok: true, value: undefined });
  reorderStagesAction.mockResolvedValue({ ok: true, value: undefined });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EditPipelineClient retry after a mid-save failure", () => {
  it("does not re-create a stage when an update fails after the create succeeded", async () => {
    updateStageAction.mockResolvedValueOnce({ ok: false, error: { id: "E_STAGE_001" } });
    renderEditor();
    fireEvent.change(screen.getByLabelText("Stage 1 name"), { target: { value: "Inbound" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add stage" }));
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E_STAGE_001"));
    expect(createStageAction).toHaveBeenCalledTimes(1);
    save();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
    expect(createStageAction).toHaveBeenCalledTimes(1);
    expect(updateStageAction).toHaveBeenCalledWith(
      { stageId: "n1", name: "New stage", rottingDays: null },
      "csrf-token",
    );
  });

  it("still renumbers on retry when the deletes settled but a later update failed", async () => {
    updateStageAction.mockResolvedValueOnce({ ok: false, error: { id: "E_STAGE_001" } });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete stage 2" }));
    fireEvent.change(screen.getByLabelText("Stage 1 name"), { target: { value: "Inbound" } });
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E_STAGE_001"));
    expect(reorderStagesAction).not.toHaveBeenCalled();
    save();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
    expect(reorderStagesAction).toHaveBeenCalledWith(
      { pipelineId: "p1", orderedStageIds: ["s1", "s3"] },
      "csrf-token",
    );
  });

  it("does not re-delete a stage that settled before the failure", async () => {
    deleteStageAction
      .mockResolvedValueOnce({ ok: true, value: undefined })
      .mockResolvedValueOnce({ ok: false, error: { id: "E_STAGE_002" } });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete stage 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete stage 2" }));
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/holds deals/));
    save();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
    const deleted = deleteStageAction.mock.calls.map(
      (c: unknown[]) => (c[0] as { stageId: string }).stageId,
    );
    expect(deleted).toEqual(["s2", "s3", "s3"]);
  });
});
