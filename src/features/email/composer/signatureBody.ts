// Pure helper for C3 (signature-in-body). The default signature is rendered INTO the compose body
// so it is visible and editable (WYSIWYG); at send the body is passed as-is with no signatureId, so
// the server never appends a second copy. This keeps exactly one signature block at the tail of the
// body so switching the signature dropdown never accumulates signatures. Extracted from Composer.tsx
// to stay under the file-size cap.

// Replace the signature currently embedded at the tail of the body with the next one. `embedded` is
// the exact html last appended (empty when none is embedded); an empty `next` removes the block
// (the user picked "None"). If the tail no longer matches `embedded` (e.g. the user edited the
// signature text), the old block is left in place and the new one appended, which the user can
// delete inline: the send path never double-appends regardless, since it passes no signatureId.
export function swapSignatureInBody(body: string, embedded: string, next: string): string {
  const base =
    embedded !== "" && body.endsWith(embedded)
      ? body.slice(0, body.length - embedded.length)
      : body;
  return base + next;
}
