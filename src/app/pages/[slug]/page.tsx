"use client";

import { useParams } from "next/navigation";
import CmsPageFromFirestore from "@/src/components/Cms/CmsPageFromFirestore";
import PrivacyPolicyContent from "@/src/components/Legal/PrivacyPolicyContent";
import TermsAndConditionsContent from "@/src/components/Legal/TermsAndConditionsContent";

export default function CMSPage() {
  const { slug } = useParams();
  const slugStr = Array.isArray(slug) ? slug[0] : slug;
  if (!slugStr) return null;
  if (slugStr === "terms-and-conditions") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="container mx-auto px-4 py-8">
          <TermsAndConditionsContent variant="landing" />
        </div>
      </div>
    );
  }
  if (slugStr === "privacy-policy") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="container mx-auto px-4 py-8">
          <PrivacyPolicyContent variant="landing" />
        </div>
      </div>
    );
  }
  return <CmsPageFromFirestore slug={slugStr} variant="standalone" />;
}
