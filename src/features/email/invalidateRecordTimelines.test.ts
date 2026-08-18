import { expect, it, vi } from "vitest";
import { invalidateRecordTimelines } from "./invalidateRecordTimelines";

it("invalidates both record-timeline message queries", () => {
  const listMessagesForDeal = vi.fn(() => Promise.resolve());
  const listMessagesForContact = vi.fn(() => Promise.resolve());

  invalidateRecordTimelines({
    email: {
      listMessagesForDeal: { invalidate: listMessagesForDeal },
      listMessagesForContact: { invalidate: listMessagesForContact },
    },
  });

  expect(listMessagesForDeal).toHaveBeenCalledTimes(1);
  expect(listMessagesForContact).toHaveBeenCalledTimes(1);
});
