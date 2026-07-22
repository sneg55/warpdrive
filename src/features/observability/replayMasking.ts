// Text of elements carrying this class is masked in replays (the compose editor body).
export const MASK_CLASS = "ph-mask-email";
// Elements carrying this class are blocked from replay entirely, recorded as a placeholder
// box (the received-email iframe, whose contents rrweb would otherwise serialize).
export const BLOCK_CLASS = "ph-block-email";

// Passed to posthog.init as `session_recording`. Unmask by default (same-company internal
// users), mask only the two email-content surfaces per the design decision.
export const sessionRecordingOptions = {
  maskAllInputs: false,
  maskTextSelector: `.${MASK_CLASS}`,
  blockSelector: `.${BLOCK_CLASS}`,
} as const;
