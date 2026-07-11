// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const createPipelineAction = vi.fn();
vi.mock("./pipelineEditActions", () => ({
  createPipelineAction: (...args: unknown[]) => createPipelineAction(...args),
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));

import { CreatePipelineButton } from "./CreatePipelineButton";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreatePipelineButton", () => {
  it("opens a dialog and disables submit until a name is entered", () => {
    render(<CreatePipelineButton label="Create pipeline" />);
    fireEvent.click(screen.getByRole("button", { name: "Create pipeline" }));
    // The dialog's submit button (last "create pipeline" button = the footer one) is disabled
    // while the name is empty, and enables once a name is entered.
    const dialogSubmit = screen.getAllByRole("button", { name: /create pipeline/i }).at(-1)!;
    expect(dialogSubmit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Pipeline name"), { target: { value: "Sales" } });
    expect(dialogSubmit).not.toBeDisabled();
  });

  it("creates with the trimmed name and navigates to the new board on success", async () => {
    createPipelineAction.mockResolvedValue({ ok: true, value: { id: "p1", name: "Sales" } });
    render(<CreatePipelineButton label="Create pipeline" onCreated="board" />);
    fireEvent.click(screen.getByRole("button", { name: "Create pipeline" }));
    fireEvent.change(screen.getByLabelText("Pipeline name"), { target: { value: "  Sales  " } });
    fireEvent.click(screen.getAllByRole("button", { name: /create pipeline/i }).at(-1)!);
    await waitFor(() =>
      expect(createPipelineAction).toHaveBeenCalledWith({ name: "Sales" }, "csrf-token"),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pipeline/p1"));
  });

  it("surfaces an error when the action rejects (thrown/validation error) and stays open", async () => {
    createPipelineAction.mockRejectedValue(new Error("boom"));
    render(<CreatePipelineButton label="Create pipeline" />);
    fireEvent.click(screen.getByRole("button", { name: "Create pipeline" }));
    fireEvent.change(screen.getByLabelText("Pipeline name"), { target: { value: "Sales" } });
    fireEvent.click(screen.getAllByRole("button", { name: /create pipeline/i }).at(-1)!);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
    // Dialog remains open so the user can retry.
    expect(screen.getByLabelText("Pipeline name")).toBeInTheDocument();
  });

  it("surfaces an error and does not navigate on failure", async () => {
    createPipelineAction.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    render(<CreatePipelineButton label="Create pipeline" />);
    fireEvent.click(screen.getByRole("button", { name: "Create pipeline" }));
    fireEvent.change(screen.getByLabelText("Pipeline name"), { target: { value: "Sales" } });
    fireEvent.click(screen.getAllByRole("button", { name: /create pipeline/i }).at(-1)!);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
