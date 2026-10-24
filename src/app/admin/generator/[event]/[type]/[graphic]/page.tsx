import PostTypeView from "@/src/components/Admin/PostTypeView";

/** One graphic: brief → options → review → templated → final posts. */
export default async function GraphicPage({ params }: { params: Promise<{ event: string; type: string; graphic: string }> }) {
  const { event, graphic } = await params;
  return <PostTypeView event={event} type={graphic} />;
}
