// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import { StageColumnMenu } from "./StageColumnMenu";

afterEach(cleanup);

const PIPELINES = [{ id: "p1", name: "Sales", stages: [{ id: "s1", name: "Qualified" }] }];

function renderMenu(overrides?: Partial<Parameters<typeof StageColumnMenu>[0]>) {
  const onToggleCollapse = vi.fn();
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <StageColumnMenu
        pipelineId="p1"
        stageId="s1"
        stageName="Qualified"
        pipelines={PIPELINES}
        collapsed={false}
        onToggleCollapse={onToggleCollapse}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onToggleCollapse };
}

describe("StageColumnMenu (P1 per-column actions)", () => {
  it("exposes a stage-actions trigger with the column-scoped items", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /Stage actions/ }));
    expect(screen.getByRole("menuitem", { name: "Add deal to this stage" })).not.toBeNull();
    const edit = screen.getByRole("menuitem", { name: "Edit pipeline stages" });
    expect(edit.getAttribute("href")).toBe("/pipeline/p1/edit");
    expect(screen.getByRole("menuitem", { name: "Collapse column" })).not.toBeNull();
  });

  it("calls onToggleCollapse when the collapse item is chosen", async () => {
    const user = userEvent.setup();
    const { onToggleCollapse } = renderMenu();
    await user.click(screen.getByRole("button", { name: /Stage actions/ }));
    await user.click(screen.getByRole("menuitem", { name: "Collapse column" }));
    expect(onToggleCollapse).toHaveBeenCalledOnce();
  });

  it("labels the toggle 'Expand column' when already collapsed", async () => {
    const user = userEvent.setup();
    renderMenu({ collapsed: true });
    await user.click(screen.getByRole("button", { name: /Stage actions/ }));
    expect(screen.getByRole("menuitem", { name: "Expand column" })).not.toBeNull();
  });
});
