const DO_NOT_TRACK_HEADER = "dnt";

export function requestsNoTracking(headers: Pick<Headers, "get">): boolean {
  return headers.get(DO_NOT_TRACK_HEADER) === "1";
}
