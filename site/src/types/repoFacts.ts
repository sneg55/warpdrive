export interface ReleaseFacts {
  version: string;
  releasedOn: string;
}

export interface RepoFacts {
  stars: number | null;
  release: ReleaseFacts | null;
}
