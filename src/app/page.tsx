import { redirect } from "next/navigation";

export default function Home(): never {
  // Land on the pipeline board, matching Pipedrive's default screen.
  redirect("/pipeline");
}
