"use client";

import { Metadata } from "next";
import { useParams } from "next/navigation";
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

  if (!page) return <div>Loading...</div>;

  return (
    <div className=" bg-slate-900 text-white">
      {/* <img
        src="/bg.webp"
        alt="Paintball players"
        className="object-cover fixed inset-0 brightness-[0.7] contrast-[110%] saturate-[120%] size-full"
        loading="lazy"
      /> */}
      <Head>
        <title>{page.metaTitle || page.title}</title>
        <meta name="description" content={page.metaDescription || ""} />
      </Head>
    
          <div className="w-full flex pt-8 px-4">
            <h1 className="text-3xl font-bold mb-4 text-orange-600 mb-0">{page.title}</h1>
          </div>
          <div dangerouslySetInnerHTML={{ __html: page.body }} />
        
    </div>
  );
}