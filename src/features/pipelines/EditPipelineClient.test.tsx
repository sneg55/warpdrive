// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type * as DndCore from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import type * as DndSortable from "@dnd-kit/sortable";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const dragEndRef = vi.hoisted(() => ({
  onDragEnd: null as ((e: DragEndEvent) => void) | null,
  contextId: undefined as string | undefined,
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof DndCore>();
  function DndContext(props: React.ComponentProps<typeof actual.DndContext>): React.ReactNode {
    dragEndRef.onDragEnd = (e: DragEndEvent) => props.onDragEnd?.(e);
    dragEndRef.contextId = props.id;
    return props.children;
  }
  return { ...actual, DndContext };
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

function drag(activeKey: string, overKey: string): void {
  act(() => {
    dragEndRef.onDragEnd?.({
      active: { id: activeKey },
      over: { id: overKey },
    } as DragEndEvent);
  });
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
  dragEndRef.onDragEnd = null;
  dragEndRef.contextId = undefined;
});

describe("EditPipelineClient hydration", () => {
  it("gives the drag context an id derived from the pipeline, not dnd-kit's counter", () => {
    renderEditor();
    const first = dragEndRef.contextId;
    expect(first).toBe("pipeline-edit-p1");
    cleanup();
    renderEditor();
    expect(dragEndRef.contextId).toBe(first);
  });
});

describe("EditPipelineClient stage reordering", () => {
  it("reorders the rows on drag end and sends the new order on save", async () => {
    renderEditor();
    drag("s3", "s1");
    expect(screen.getByLabelText("Stage 1 name")).toHaveValue("Won prep");
    save();
    await waitFor(() =>
      expect(reorderStagesAction).toHaveBeenCalledWith(
        { pipelineId: "p1", orderedStageIds: ["s3", "s1", "s2"] },
        "csrf-token",
      ),
    );
    expect(updateStageAction).not.toHaveBeenCalled();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
  });

  it("does not call reorderStagesAction when the order is unchanged", async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Stage 2 name"), { target: { value: "Talking" } });
    save();
    await waitFor(() => expect(updateStageAction).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
    expect(reorderStagesAction).not.toHaveBeenCalled();
  });

  it("sends the full order after a create, since the server numbers a new stage by count", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "+ Add stage" }));
    save();
    await waitFor(() =>
      expect(createStageAction).toHaveBeenCalledWith(
        { pipelineId: "p1", name: "New stage", rottingDays: null },
        "csrf-token",
      ),
    );
    await waitFor(() =>
      expect(reorderStagesAction).toHaveBeenCalledWith(
        { pipelineId: "p1", orderedStageIds: ["s1", "s2", "s3", "n1"] },
        "csrf-token",
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
  });

  it("sends the full order after a delete, so the surviving stages stay contiguous", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete stage 2" }));
    save();
    await waitFor(() =>
      expect(reorderStagesAction).toHaveBeenCalledWith(
        { pipelineId: "p1", orderedStageIds: ["s1", "s3"] },
        "csrf-token",
      ),
    );
  });

  it("orders a stage created in the same pass as a delete", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete stage 2" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add stage" }));
    save();
    await waitFor(() =>
      expect(reorderStagesAction).toHaveBeenCalledWith(
        { pipelineId: "p1", orderedStageIds: ["s1", "s3", "n1"] },
        "csrf-token",
      ),
    );
  });

  it("does not create the same stage twice when a failed save is retried", async () => {
    reorderStagesAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PIPELINE_001" } });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "+ Add stage" }));
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E_PIPELINE_001"));
    save();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
    expect(createStageAction).toHaveBeenCalledTimes(1);
    expect(reorderStagesAction).toHaveBeenLastCalledWith(
      { pipelineId: "p1", orderedStageIds: ["s1", "s2", "s3", "n1"] },
      "csrf-token",
    );
  });

  it("places a just-created stage id at the dragged position", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "+ Add stage" }));
    drag("new-0", "s1");
    save();
    await waitFor(() =>
      expect(reorderStagesAction).toHaveBeenCalledWith(
        { pipelineId: "p1", orderedStageIds: ["n1", "s1", "s2", "s3"] },
        "csrf-token",
      ),
    );
  });

  it("does not delete the same stage twice when a failed save is retried", async () => {
    reorderStagesAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PIPELINE_001" } });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete stage 2" }));
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E_PIPELINE_001"));
    save();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
    expect(deleteStageAction).toHaveBeenCalledTimes(1);
  });

  it("keeps editing an adopted stage after a failed save", async () => {
    reorderStagesAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PIPELINE_001" } });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "+ Add stage" }));
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E_PIPELINE_001"));
    fireEvent.change(screen.getByLabelText("Stage 4 name"), { target: { value: "Demo" } });
    save();
    await waitFor(() =>
      expect(updateStageAction).toHaveBeenCalledWith(
        { stageId: "n1", name: "Demo", rottingDays: null },
        "csrf-token",
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
  });

  it("still reorders on retry when the deletes already succeeded", async () => {
    reorderStagesAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PIPELINE_001" } });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete stage 2" }));
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E_PIPELINE_001"));
    save();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
    expect(reorderStagesAction).toHaveBeenCalledTimes(2);
    expect(reorderStagesAction).toHaveBeenLastCalledWith(
      { pipelineId: "p1", orderedStageIds: ["s1", "s3"] },
      "csrf-token",
    );
  });

  it("keeps a delete queued while the stage ops are still in flight", async () => {
    let release = (): void => undefined;
    deleteStageAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, value: undefined });
        }),
    );
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete stage 2" }));
    save();
    await waitFor(() =>
      expect(deleteStageAction).toHaveBeenCalledWith({ stageId: "s2" }, "csrf-token"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete stage 2" }));
    release();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
    save();
    await waitFor(() =>
      expect(deleteStageAction).toHaveBeenCalledWith({ stageId: "s3" }, "csrf-token"),
    );
    expect(deleteStageAction).toHaveBeenCalledTimes(2);
  });

  it("surfaces an error when an action rejects instead of returning a result", async () => {
    reorderStagesAction.mockRejectedValue(new Error("network"));
    renderEditor();
    drag("s2", "s1");
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/try again/i));
    expect(push).not.toHaveBeenCalled();
  });

  it("surfaces the error and does not navigate when the reorder fails", async () => {
    reorderStagesAction.mockResolvedValue({ ok: false, error: { id: "E_PIPELINE_001" } });
    renderEditor();
    drag("s2", "s1");
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E_PIPELINE_001"));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
