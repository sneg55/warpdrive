import { redirect } from "next/navigation";

export default function DealsIndexRedirect(): never {
  redirect("/pipeline");
}
