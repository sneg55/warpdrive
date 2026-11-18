import { redirect } from "next/navigation";

export default function ActivitiesIndexPage(): never {
  redirect("/activities/list");
}
