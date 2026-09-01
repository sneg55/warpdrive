import type { ProspectProfile } from "../providers/types";
import type { BadgedProspect } from "./types";

function opt<K extends string>(key: K, value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { [key]: value };
}

export function prospectActionProfile(profile: BadgedProspect): ProspectProfile {
  return {
    providerRef: profile.providerRef,
    fullName: profile.fullName,
    hasEmail: profile.hasEmail,
    hasPhone: profile.hasPhone,
    ...opt("firstName", profile.firstName),
    ...opt("lastName", profile.lastName),
    ...opt("title", profile.title),
    ...opt("seniority", profile.seniority),
    ...opt("department", profile.department),
    ...opt("linkedinUrl", profile.linkedinUrl),
    ...opt("city", profile.city),
    ...opt("country", profile.country),
  };
}
