// No interception active -> the modal slot renders nothing (the inbox shows alone). Required by
// Next.js parallel routing so the `modal` slot has a fallback on non-intercepted navigations.
export default function ModalDefault(): null {
  return null;
}
