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
    <div className="flex min-h-screen">
      <img
        src="/bg.webp"
        alt="Paintball players"
        className="object-cover fixed inset-0 brightness-[0.7] contrast-[110%] saturate-[120%] size-full"
        loading="lazy"
      />
      <Head>
        <title>{page.metaTitle || page.title}</title>
        <meta name="description" content={page.metaDescription || ""} />
      </Head>
      <div className="flex items-center justify-center p-4 w-full  overflow-auto">
      <Card className="w-full max-w-md bg-transparent backdrop-blur-md text-white m-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center  uppercase">
            {page.title}
          </CardTitle>
        </CardHeader>
        <CardContent>

                <div dangerouslySetInnerHTML={{ __html: page.body }} />

        </CardContent>
      </Card>
      </div>

    </div>
  );
}