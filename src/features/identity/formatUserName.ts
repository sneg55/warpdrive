const UNASSIGNED_LABEL = "Unassigned";
const EMAIL_SEPARATOR = "@";
const LOCAL_PART_SEPARATOR_PATTERN = /[._+-]+/;

function titleCaseWord(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

export function formatUserName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return UNASSIGNED_LABEL;

  const atIndex = trimmed.indexOf(EMAIL_SEPARATOR);
  if (atIndex <= 0) return trimmed;

  const localPart = trimmed.slice(0, atIndex);
  const formattedLocalPart = localPart
    .split(LOCAL_PART_SEPARATOR_PATTERN)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ");

  return formattedLocalPart === "" ? UNASSIGNED_LABEL : formattedLocalPart;
}
