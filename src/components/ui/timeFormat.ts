export function isValidHm(v: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  if (m === null) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

function maskColonTime(trimmed: string, colonIdx: number): string {
  const hDigits = trimmed.slice(0, colonIdx).replace(/\D/g, "");
  const minDigits = trimmed.slice(colonIdx + 1).replace(/\D/g, "");
  if (hDigits === "") return "";
  const h = Number(hDigits);
  const min = minDigits === "" ? 0 : Number(minDigits);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function maskTime(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (isValidHm(trimmed)) return trimmed;
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx !== -1) return maskColonTime(trimmed, colonIdx);
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return "";
  let h: number;
  let min: number;
  if (digits.length <= 2) {
    h = Number(digits);
    min = 0;
  } else {
    const hLen = digits.length === 3 ? 1 : 2;
    h = Number(digits.slice(0, hLen));
    min = Number(digits.slice(hLen));
  }
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
