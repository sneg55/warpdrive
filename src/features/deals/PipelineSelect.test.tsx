// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: () => {} }) }));
vi.mock("@/features/pipelines/pipelineEditActions", () => ({ createPipelineAction: vi.fn() }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));

import { PipelineSelect } from "./PipelineSelect";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PIPELINES = [
  { id: "p1", name: "Sales" },
  { id: "p2", name: "Partnerships" },
];

describe("PipelineSelect", () => {
  it("lists every pipeline and switches boards on select", async () => {
    const user = userEvent.setup();
    render(<PipelineSelect pipelineId="p1" pipelines={PIPELINES} canManagePipelines />);
    await user.click(screen.getByRole("button", { name: /Sales/ }));
    await user.click(screen.getByRole("menuitem", { name: "Partnerships" }));
    expect(push).toHaveBeenCalledWith("/pipeline/p2");
  });

  it("offers an Add new pipeline item that opens the create dialog", async () => {
    const user = userEvent.setup();
    render(<PipelineSelect pipelineId="p1" pipelines={PIPELINES} canManagePipelines />);
    await user.click(screen.getByRole("button", { name: /Sales/ }));
    await user.click(screen.getByRole("menuitem", { name: "Add new pipeline" }));
    expect(await screen.findByRole("dialog", { name: "Create pipeline" })).toBeInTheDocument();
    expect(screen.getByLabelText("Pipeline name")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("hides Add new pipeline from users who cannot manage pipelines", async () => {
    const user = userEvent.setup();
    render(<PipelineSelect pipelineId="p1" pipelines={PIPELINES} canManagePipelines={false} />);
    await user.click(screen.getByRole("button", { name: /Sales/ }));
    expect(screen.getByRole("menuitem", { name: "Partnerships" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Add new pipeline" })).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("returns focus to the pipeline selector when the create dialog is dismissed", async () => {
    const user = userEvent.setup();
    render(<PipelineSelect pipelineId="p1" pipelines={PIPELINES} canManagePipelines />);
    const trigger = screen.getByRole("button", { name: /Sales/ });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Add new pipeline" }));
    await screen.findByRole("dialog", { name: "Create pipeline" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });
});
