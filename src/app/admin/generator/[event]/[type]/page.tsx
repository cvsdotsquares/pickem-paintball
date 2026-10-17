import PostTypeView from "@/src/components/Admin/PostTypeView";

export default async function PostTypePage({ params }: { params: Promise<{ event: string; type: string }> }) {
  const { event, type } = await params;
  return <PostTypeView event={event} type={type} />;
}
