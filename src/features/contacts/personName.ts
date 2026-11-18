export function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p !== "");
  if (parts.length === 0) return { firstName: "", lastName: null };
  const [firstName = "", ...rest] = parts;
  return { firstName, lastName: rest.length > 0 ? rest.join(" ") : null };
}

export function joinName(parts: { firstName: string; lastName?: string | null }): string {
  return [parts.firstName.trim(), (parts.lastName ?? "").trim()].filter((p) => p !== "").join(" ");
}

interface ResolvedPersonName {
  firstName: string | null;
  lastName: string | null;
  name: string;
}

export function resolvePersonName(
  input: { firstName?: string | null; lastName?: string | null; name?: string },
  current: { firstName: string | null; lastName: string | null; name: string },
): ResolvedPersonName {
  const editingName = input.firstName !== undefined || input.lastName !== undefined;
  if (editingName) {
    const firstName = input.firstName === undefined ? current.firstName : input.firstName;
    const lastName = input.lastName === undefined ? current.lastName : input.lastName;
    return { firstName, lastName, name: joinName({ firstName: firstName ?? "", lastName }) };
  }
  if (input.name !== undefined) {
    const split = splitName(input.name);
    return { firstName: split.firstName, lastName: split.lastName, name: input.name };
  }
  return { firstName: current.firstName, lastName: current.lastName, name: current.name };
}
