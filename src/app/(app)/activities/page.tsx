import { redirect } from "next/navigation";

// The primary nav links to /activities; land on the to-do list (Pipedrive's
// default Activities view), with the calendar available via the view toggle.
export default function ActivitiesIndexPage(): never {
  redirect("/activities/list");
}
