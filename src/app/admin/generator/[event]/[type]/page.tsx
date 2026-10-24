import { redirect } from "next/navigation";
import PostTypeHub from "@/src/components/Admin/PostTypeHub";

/** One post type: its graphics side by side. (Old links straight to a graphic, /<event>/<type>__2, are forwarded.) */
export default async function PostTypePage({ params }: { params: Promise<{ event: string; type: string }> }) {
  const { event, type } = await params;
  if (type.includes("__")) redirect(`/admin/generator/${event}/${type.split("__")[0]}/${type}`);
  return <PostTypeHub event={event} type={type} />;
}
