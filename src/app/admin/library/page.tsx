import { redirect } from "next/navigation";

/** The Post Library lives in the Social hub now (James 25 Oct 2026). */
export default function LibraryPage() {
  redirect("/admin/social?tab=library");
}
