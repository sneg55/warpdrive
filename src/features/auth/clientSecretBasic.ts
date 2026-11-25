const SERIALIZED_PREFIX = "v=";

export function formUrlEncode(value: string): string {
  return new URLSearchParams({ v: value }).toString().slice(SERIALIZED_PREFIX.length);
}

export function clientSecretBasicHeader(clientId: string, clientSecret: string): string {
  const credentials = `${formUrlEncode(clientId)}:${formUrlEncode(clientSecret)}`;
  return `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
}
