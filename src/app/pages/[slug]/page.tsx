"use client";

import { Metadata } from "next";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/src/lib/firebaseClient";
import { collection, query, where, getDocs } from "firebase/firestore";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";



// // This runs server-side before rendering the page
// export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
//   // Fetch the CMS page by slug from Firestore
//   const q = query(collection(db, "cmsPages"), where("slug", "==", params.slug));
//   const snapshot = await getDocs(q);
//   if (!snapshot.empty) {
//     const page = snapshot.docs[0].data();
//     return {
//       title: page.metaTitle || page.title,
//       description: page.metaDescription || "",
//     };
//   }
//   // Fallback if not found
//   return {
//     title: "Page Not Found",
//     description: "",
//   };
// }

export default function CMSPage() {
  const { slug } = useParams();
  const router = useRouter();
  const [page, setPage] = useState<any>(null);

  useEffect(() => {
    if (!slug) return;
    const fetchPage = async () => {
      const q = query(collection(db, "cmsPages"), where("slug", "==", slug));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) setPage(snapshot.docs[0].data());
    };
    fetchPage();
  }, [slug]);

  if (!page) return <div className="flex items-center justify-center min-h-screen bg-white dark:bg-slate-900 text-gray-900 dark:text-white">Loading...</div>;

  return (
    <div className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white min-h-screen">
      <Head>
        <title>{page.metaTitle || page.title}</title>
        <meta name="description" content={page.metaDescription || ""} />
      </Head>

          <div className="w-full flex items-center gap-4 pt-8 px-4">
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back();
                } else {
                  router.push('/dashboard');
                }
              }}
              className="rounded border border-orange-600/40 text-orange-600 dark:text-orange-400 hover:bg-orange-600/10 px-3 py-1 text-sm transition"
              aria-label="Go back"
            >
              ← Back
            </button>
            <h1 className="text-3xl font-bold text-orange-600 mb-0">{page.title}</h1>
          </div>
          <div className="prose dark:prose-invert max-w-none px-4 py-6" dangerouslySetInnerHTML={{ __html: page.body }} />

    </div>
  );
}