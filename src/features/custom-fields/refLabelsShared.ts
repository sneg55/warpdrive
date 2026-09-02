export type CustomFieldRefLabels = {
  user: Record<string, string>;
  person: Record<string, string>;
  org: Record<string, string>;
};

export const EMPTY_REF_LABELS: CustomFieldRefLabels = { user: {}, person: {}, org: {} };

export function mergeRefLabels(
  a: CustomFieldRefLabels,
  b: CustomFieldRefLabels,
): CustomFieldRefLabels {
  return {
    user: { ...a.user, ...b.user },
    person: { ...a.person, ...b.person },
    org: { ...a.org, ...b.org },
  };
}
