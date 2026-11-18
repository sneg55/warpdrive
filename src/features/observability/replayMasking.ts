export const MASK_CLASS = "ph-mask-email";
export const BLOCK_CLASS = "ph-block-email";

export const sessionRecordingOptions = {
  maskAllInputs: false,
  maskTextSelector: `.${MASK_CLASS}`,
  blockSelector: `.${BLOCK_CLASS}`,
} as const;
