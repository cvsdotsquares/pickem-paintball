"use client";

import { useState, useRef, useEffect } from "react";

const screens = [
  {
    key: "picks",
    label: (
      <>
        You make your <span className="text-pickem-green">picks</span>.
      </>
    ),
    image: "/landing/picks-screenshot.png",
  },
  {
    key: "stats",
    label: (
      <>
        We track <span className="text-pickem-green">live stats</span>.
      </>
    ),
    image: "/landing/stats-screenshot.png",
  },
  {
    key: "leaderboard",
    label: (
      <>
        You climb the <span className="text-pickem-green">leaderboard</span>.
      </>
    ),
    image: "/landing/leaderboard-screenshot.png",
  },
];

const ProductPreview = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const scrollLeft = el.scrollLeft;
      const cardWidth = el.scrollWidth / screens.length;
      const index = Math.round(scrollLeft / cardWidth);
      setActiveIndex(Math.min(index, screens.length - 1));
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / screens.length;
    el.scrollTo({ left: cardWidth * index, behavior: "smooth" });
  };

  return (
    <section className="relative z-10 overflow-hidden bg-pickem-navy pb-8 pt-8 md:pb-12 md:pt-12">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-10 text-center">
          <h2 className="font-heading text-3xl font-bold uppercase tracking-wide text-white md:text-5xl">
            How It Works
          </h2>
          <div className="mx-auto mt-5 h-1 w-28 rounded-full bg-pickem-green" />
        </div>

        <div
          ref={scrollRef}
          style={{ WebkitOverflowScrolling: "touch" }}
          className="flex touch-pan-x snap-x snap-mandatory overflow-x-auto pb-4 scrollbar-hide md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0"
        >
          {screens.map((screen) => (
            <div
              key={screen.key}
              className="w-[85vw] flex-shrink-0 snap-center px-3 md:w-auto md:px-0"
            >
              <div className="overflow-hidden rounded-xl border border-white/10 bg-pickem-navy-light shadow-2xl">
                <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                </div>
                <img
                  src={screen.image}
                  alt=""
                  className="aspect-[4/3] w-full object-cover object-top"
                />
              </div>
              <p className="mt-4 text-center font-heading text-lg font-semibold text-white">
                {screen.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 md:hidden">
          {screens.map((screen, i) => (
            <button
              key={screen.key}
              type="button"
              onClick={() => scrollTo(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === activeIndex ? "w-6 bg-pickem-green" : "w-2 bg-white/30"
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductPreview;
