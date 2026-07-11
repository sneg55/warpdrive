import { redirect } from "next/navigation";

// Deals is no longer its own destination: it is the pipeline's List view. Send the old flat
// /deals route to the pipeline, which lands on the user's first pipeline (board), from where the
// Board|List toggle reaches the list. The deal workspace at /deals/[dealId] is unaffected.
export default function DealsIndexRedirect(): never {
  redirect("/pipeline");
}
