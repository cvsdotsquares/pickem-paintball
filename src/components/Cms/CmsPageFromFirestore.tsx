"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { cn } from "@/src/lib/utils";
import { transformFaqPageBody, transformFaqPageBodyForDashboard } from "@/src/lib/faqCmsTransforms";

/** No stroke around rows — keeps tint + radius so rows read as soft bands, not framed boxes. */
const FAQ_DETAILS_CLASS =
  "faq-details group mb-2 overflow-hidden rounded-lg bg-gray-50/80 dark:bg-stone-900/50";

const FAQ_SUMMARY_CLASS =
  "cursor-pointer list-none px-3 py-2.5 pr-10 font-bold text-gray-900 outline-none transition hover:bg-gray-100/80 dark:text-white dark:hover:bg-white/[0.06] [&::-webkit-details-marker]:hidden sm:px-4";

const FAQ_ANSWER_CLASS =
  "px-3 pb-3 pt-2 text-base leading-relaxed text-gray-800 dark:text-stone-200 sm:px-4";

function isQuestionParagraph(el: HTMLElement): boolean {
  if (el.tagName !== "P") return false;
  const t = el.textContent?.trim() ?? "";
  return /^Q\s*:/i.test(t);
}

/** Wrap FAQ headings (h3) + following content in <details>. */
function wrapFaqH3Blocks(container: HTMLElement) {
  const h3List = Array.from(container.querySelectorAll("h3"));
  for (const h3 of h3List) {
    if (h3.closest("details")) continue;

    const parent = h3.parentElement;
    if (!parent) continue;

    const details = document.createElement("details");
    details.className = FAQ_DETAILS_CLASS;

    const summary = document.createElement("summary");
    summary.className = FAQ_SUMMARY_CLASS;

    parent.insertBefore(details, h3);
    summary.appendChild(h3);
    details.appendChild(summary);

    const answer = document.createElement("div");
    answer.className = FAQ_ANSWER_CLASS;

    let sibling = details.nextSibling;
    while (sibling) {
      const next = sibling.nextSibling;
      if (sibling.nodeType === Node.ELEMENT_NODE) {
        const el = sibling as HTMLElement;
        if (el.tagName === "H2" || el.tagName === "H3") break;
        if (el.tagName === "P" && isQuestionParagraph(el)) break;
      }
      answer.appendChild(sibling);
      sibling = next;
    }
    details.appendChild(answer);
  }
}

/** CMS often uses <p>Q: ...</p> / <p>A: ...</p> instead of h3 — same accordion treatment. */
function wrapFaqParagraphBlocks(container: HTMLElement) {
  const candidates = Array.from(container.querySelectorAll("p")).filter((p) => {
    if (p.closest("details")) return false;
    return isQuestionParagraph(p);
  });

  for (const questionP of candidates) {
    const parent = questionP.parentElement;
    if (!parent) continue;

    const details = document.createElement("details");
    details.className = FAQ_DETAILS_CLASS;

    const summary = document.createElement("summary");
    summary.className = FAQ_SUMMARY_CLASS;

    parent.insertBefore(details, questionP);
    summary.appendChild(questionP);
    details.appendChild(summary);

    const answer = document.createElement("div");
    answer.className = FAQ_ANSWER_CLASS;

    let sibling = details.nextSibling;
    while (sibling) {
      const next = sibling.nextSibling;
      if (sibling.nodeType === Node.ELEMENT_NODE) {
        const el = sibling as HTMLElement;
        if (el.tagName === "H2" || el.tagName === "H3") break;
        if (el.tagName === "P" && isQuestionParagraph(el)) break;
      }
      answer.appendChild(sibling);
      sibling = next;
    }
    details.appendChild(answer);
  }
}

function wrapFaqQuestions(container: HTMLElement) {
  wrapFaqH3Blocks(container);
  wrapFaqParagraphBlocks(container);
}

/**
 * FAQ HTML must be applied in useLayoutEffect only — if we use dangerouslySetInnerHTML in JSX,
 * React reapplies the raw string on re-renders and strips <details> wrappers we add here.
 */
function FaqHtmlAccordion({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html;
    wrapFaqQuestions(el);
  }, [html]);

  return (
    <div
      ref={ref}
      className={cn("faq-html-accordion max-w-none", className)}
      suppressHydrationWarning
    />
  );
}

export type CmsPageRecord = {
  title?: string;
  metaTitle?: string;
  metaDescription?: string;
  body?: string;
};

type CmsPageFromFirestoreProps = {
  slug: string;
  /** Standalone: full-page layout with Back (e.g. legacy /pages/[slug]). Dashboard: title + body only for use inside dashboard shell. */
  variant: "standalone" | "dashboard";
};

export default function CmsPageFromFirestore({
  slug,
  variant,
}: CmsPageFromFirestoreProps) {
  const router = useRouter();
  const [page, setPage] = useState<CmsPageRecord | null>(null);

  const isFaq = slug === "faq";

  const displayBody = useMemo(() => {
    const raw = page?.body ?? "";
    if (!isFaq) return raw;
    if (variant === "dashboard") {
      return transformFaqPageBodyForDashboard(raw);
    }
    return transformFaqPageBody(raw);
  }, [page?.body, isFaq, variant]);

  useEffect(() => {
    const fetchPage = async () => {
      const q = query(collection(db, "cmsPages"), where("slug", "==", slug));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) setPage(snapshot.docs[0].data() as CmsPageRecord);
    };
    void fetchPage();
  }, [slug]);

  /** App Router: do not use `next/head` (unsupported here; can cause webpack runtime errors). */
  useEffect(() => {
    if (!page) return;
    const t = page.metaTitle || page.title;
    if (t) document.title = t;
    if (variant !== "standalone") return;
    const desc = page.metaDescription?.trim() ?? "";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, [page, variant]);

  if (!page) {
    if (variant === "dashboard") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center text-gray-500 dark:text-gray-400">
          Loading…
        </div>
      );
    }
    return (
      <div
        className={cn(
          "flex min-h-screen items-center justify-center",
          isFaq
            ? "bg-slate-900 text-white"
            : "bg-white text-gray-900 dark:bg-slate-900 dark:text-white",
        )}
      >
        Loading…
      </div>
    );
  }

  if (variant === "dashboard") {
    return (
      <>
        {!(isFaq) ? (
          <h1 className="mb-4 font-azonix text-2xl font-bold text-orange-600 dark:text-orange-400 md:text-3xl">
            {page.title}
          </h1>
        ) : null}
        {isFaq ? (
          <FaqHtmlAccordion html={displayBody} className="px-0 py-0 pt-0" />
        ) : (
          <div
            className={cn("max-w-none", "prose dark:prose-invert max-w-none")}
            dangerouslySetInnerHTML={{ __html: displayBody }}
          />
        )}
      </>
    );
  }

  return (
    <div
      className={cn(
        "min-h-screen",
        isFaq
          ? "bg-slate-900 text-white"
          : "bg-white text-gray-900 dark:bg-slate-900 dark:text-white",
      )}
    >
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

      {isFaq ? (
        <FaqHtmlAccordion html={displayBody} className="px-0 py-2" />
      ) : (
        <div
          className={cn("max-w-none", "px-4 py-6 prose dark:prose-invert")}
          dangerouslySetInnerHTML={{ __html: displayBody }}
        />
      )}
    </div>
  );
}
