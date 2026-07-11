// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PipelineBreadcrumb } from "./PipelineBreadcrumb";

afterEach(cleanup);

it("renders the real pipeline name and current stage, not the literal 'Pipeline'", () => {
  render(
    <PipelineBreadcrumb
      pipelineId="p1"
      pipelineName="Sales pipeline"
      currentStageName="Proposal Made"
    />,
  );
  expect(screen.getByText("Sales pipeline")).toBeTruthy();
  expect(screen.getByText("Proposal Made")).toBeTruthy();
  expect(screen.queryByText("Pipeline")).toBeNull();
});
