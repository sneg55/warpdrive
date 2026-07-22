// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { BLOCK_CLASS } from "@/features/observability/replayMasking";
import { MessageBodyFrame } from "./MessageBodyFrame";

it("blocks the email body iframe from replay", () => {
  const { container } = render(
    <MessageBodyFrame html="<p>secret</p>" allowRemote onShowRemote={() => {}} />,
  );
  const iframe = container.querySelector("iframe");
  expect(iframe?.className).toContain(BLOCK_CLASS);
});
