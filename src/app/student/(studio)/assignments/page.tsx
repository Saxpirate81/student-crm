import { redirect } from "next/navigation";

/** Tasks now live under Practice; keep this URL for bookmarks and old links. */
export default function StudentAssignmentsRedirectPage() {
  redirect("/student/practice");
}
