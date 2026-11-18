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
