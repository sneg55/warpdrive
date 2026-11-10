import type { EmailVisibility } from "../threadVisibility";
import type { ComposerContext } from "./composer.types";

export interface ComposerProps {
  accountId: string;
  fromAddress?: string;
  senderPicker?: React.ReactNode;
  context?: ComposerContext;
  threadId?: string;
  linkDealId?: string;
  draft?: {
    id: string;
    accountId?: string;
    subject: string;
    bodyHtml: string;
    to: string[];
    cc: string[];
    threadId?: string | null;
    visibility?: EmailVisibility;
    linkDealId?: string | null;
    linkPersonId?: string | null;
  };
  prefill?: { to?: string[]; cc?: string[]; subject?: string; bodyHtml?: string };
  onSent?: () => void;
  onClose?: () => void;
}
