import { expect, it } from "vitest";
import { BLOCK_CLASS, MASK_CLASS, sessionRecordingOptions } from "./replayMasking";

it("records by default, text-masks the mask class, blocks the block class", () => {
  expect(MASK_CLASS).toBe("ph-mask-email");
  expect(BLOCK_CLASS).toBe("ph-block-email");
  expect(sessionRecordingOptions.maskAllInputs).toBe(false);
  expect(sessionRecordingOptions.maskTextSelector).toContain(MASK_CLASS);
  expect(sessionRecordingOptions.blockSelector).toContain(BLOCK_CLASS);
});
