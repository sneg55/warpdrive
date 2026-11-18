export function swapSignatureInBody(body: string, embedded: string, next: string): string {
  const base =
    embedded !== "" && body.endsWith(embedded)
      ? body.slice(0, body.length - embedded.length)
      : body;
  return base + next;
}
