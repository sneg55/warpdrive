import type { SearchMatchSource } from "@/constants/search";

export interface SearchMatch {
  source: SearchMatchSource;
  label: string;
  snippet: string;
}

export interface SearchResult {
  id: string;
  primary: string;
  secondary: string | null;
  match: SearchMatch | null;
}

export interface SearchResults {
  deals: SearchResult[];
  people: SearchResult[];
  organizations: SearchResult[];
  leads: SearchResult[];
}
