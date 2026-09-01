// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProspectRevealStep } from "./ProspectRevealStep";

afterEach(cleanup);

const noop = (): void => undefined;

describe("ProspectRevealStep", () => {
  it("counts progress against the total", () => {
    render(
      <ProspectRevealStep
        status="running"
        processed={5}
        total={20}
        stopping={false}
        failures={0}
        error={null}
        onStop={noop}
      />,
    );
    expect(screen.getByText("Revealing 5 of 20")).toBeInTheDocument();
  });

  it("offers a stop only while it is running", () => {
    const { rerender } = render(
      <ProspectRevealStep
        status="running"
        processed={1}
        total={2}
        stopping={false}
        failures={0}
        error={null}
        onStop={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    rerender(
      <ProspectRevealStep
        status="done"
        processed={2}
        total={2}
        stopping={false}
        failures={0}
        error={null}
        onStop={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  it("says what was kept when the user stops midway", () => {
    render(
      <ProspectRevealStep
        status="aborted"
        processed={7}
        total={20}
        stopping={false}
        failures={0}
        error={null}
        onStop={noop}
      />,
    );
    expect(
      screen.getByText("Stopped after 7 people. What was revealed is kept."),
    ).toBeInTheDocument();
  });

  it("surfaces a failure instead of ending quietly", () => {
    render(
      <ProspectRevealStep
        status="error"
        processed={3}
        total={20}
        stopping={false}
        failures={0}
        error="provider down"
        onStop={noop}
      />,
    );
    expect(screen.getByText(/provider down/)).toBeInTheDocument();
  });

  it("stops offering a second stop while the batch already sent finishes", () => {
    render(
      <ProspectRevealStep
        status="running"
        processed={0}
        total={9}
        stopping
        failures={0}
        error={null}
        onStop={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Finishing the batch already sent" })).toBeDisabled();
  });

  it("says how many people could not be revealed when nothing came back", () => {
    render(
      <ProspectRevealStep
        status="done"
        processed={2}
        total={2}
        stopping={false}
        failures={2}
        error={null}
        onStop={noop}
      />,
    );
    expect(screen.getByText("2 people could not be revealed.")).toBeInTheDocument();
  });

  it("calls back when stopped", () => {
    const onStop = vi.fn();
    render(
      <ProspectRevealStep
        status="running"
        processed={1}
        total={9}
        stopping={false}
        failures={0}
        error={null}
        onStop={onStop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
