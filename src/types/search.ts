export interface SearchResult {
  id: string;
  primary: string;
  secondary: string | null;
}

export interface SearchResults {
  deals: SearchResult[];
  people: SearchResult[];
  organizations: SearchResult[];
  leads: SearchResult[];
}
