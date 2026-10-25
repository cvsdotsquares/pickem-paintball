import { redirect } from "next/navigation";

/** The Post Generator lives in the Social hub now (James 25 Oct 2026); its post types stay at /admin/generator/<event>/<type>. */
export default function GeneratorPage() {
  redirect("/admin/social?tab=generator");
}
