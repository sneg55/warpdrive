// The deal and person record timelines read their linked email through these two message-level
// queries. Any mutation that adds a message or moves a thread between records has to refresh both:
// a send can land under either record, and a link change moves the thread from one to the other.
// Invalidating without an input key covers every mounted record, since the writer rarely knows
// which deal or person the server resolved the link to.
export interface RecordTimelineUtils {
  email: {
    listMessagesForDeal: { invalidate: () => Promise<void> };
    listMessagesForContact: { invalidate: () => Promise<void> };
  };
}

export function invalidateRecordTimelines(utils: RecordTimelineUtils): void {
  void utils.email.listMessagesForDeal.invalidate();
  void utils.email.listMessagesForContact.invalidate();
}
