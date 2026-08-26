import { CalendarDays, FileText, Mail, Paperclip } from "lucide-react";
import type React from "react";

// Tab glyphs for the deal compose toolbar. aria-hidden: the tab's text label names it.

const TAB_ICON_CLASS = "h-4 w-4 shrink-0";

export const ActivityIcon = (): React.ReactNode => (
  <CalendarDays aria-hidden="true" className={TAB_ICON_CLASS} />
);

export const NotesIcon = (): React.ReactNode => (
  <FileText aria-hidden="true" className={TAB_ICON_CLASS} />
);

export const EmailIcon = (): React.ReactNode => (
  <Mail aria-hidden="true" className={TAB_ICON_CLASS} />
);

export const FilesIcon = (): React.ReactNode => (
  <Paperclip aria-hidden="true" className={TAB_ICON_CLASS} />
);
