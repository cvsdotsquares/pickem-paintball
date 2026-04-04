"use client";

import { useParams } from "next/navigation";
import CmsPageFromFirestore from "@/src/components/Cms/CmsPageFromFirestore";

export default function CMSPage() {
  const { slug } = useParams();
  const slugStr = Array.isArray(slug) ? slug[0] : slug;
  if (!slugStr) return null;
  return <CmsPageFromFirestore slug={slugStr} variant="standalone" />;
}
