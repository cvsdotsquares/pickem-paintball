"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/src/lib/firebaseClient";
import { collection, query, where, getDocs } from "firebase/firestore";
import Head from "next/head";
import { cn } from "@/src/lib/utils";
import { transformFaqPageBody } from "@/src/lib/faqCmsTransforms";

export default function CMSPage() {
  const { slug } = useParams();
  const router = useRouter();
  const [page, setPage] = useState<{
    title?: string;
    metaTitle?: string;
    metaDescription?: string;
    body?: string;
  } | null>(null);

  const slugStr = Array.isArray(slug) ? slug[0] : slug;
  const isFaq = slugStr === "faq";

  const displayBody = useMemo(() => {
    const raw = page?.body ?? "";
    if (isFaq) {
      return transformFaqPageBody(raw);
    }
    return raw;
  }, [page?.body, isFaq]);

  useEffect(() => {
    if (!slug) return;
    const fetchPage = async () => {
      const q = query(collection(db, "cmsPages"), where("slug", "==", slug));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) setPage(snapshot.docs[0].data());
    };
    fetchPage();
  }, [slug]);

  if (!page) {
    return (
      <div
        className={cn(
          "flex min-h-screen items-center justify-center",
          isFaq ? "bg-slate-900 text-white" : "bg-white text-gray-900 dark:bg-slate-900 dark:text-white",
        )}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-h-screen",
        isFaq ? "bg-slate-900 text-white" : "bg-white text-gray-900 dark:bg-slate-900 dark:text-white",
      )}
    >
      <Head>
        <title>{page.metaTitle || page.title}</title>
        <meta name="description" content={page.metaDescription || ""} />
      </Head>

      <div className="flex w-full items-center gap-4 px-4 pt-8">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/dashboard");
            }
          }}
          className={cn(
            "rounded border px-3 py-1 text-sm transition",
            isFaq
              ? "border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
              : "border-orange-600/40 text-orange-600 hover:bg-orange-600/10 dark:text-orange-400",
          )}
          aria-label="Go back"
        >
          ← Back
        </button>
        <h1 className="mb-0 text-3xl font-bold text-orange-600">
          {page.title}
        </h1>
      </div>

      {/* FAQ body from Firestore already includes bg-slate-900 wrappers + typography classes; no prose wrapper. */}
      <div
        className={cn("max-w-none", isFaq ? "px-0 py-2" : "px-4 py-6 prose dark:prose-invert")}
        dangerouslySetInnerHTML={{ __html: displayBody }}
      />
    </div>
  );
}
