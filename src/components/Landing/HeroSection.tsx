"use client";

import Link from "next/link";
import { Button } from "@/src/components/Landing/ui/button";
import { ChevronRight, ChevronDown } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="relative min-h-[90vh] overflow-hidden bg-pickem-navy">
      <div className="absolute inset-0">
        <img
          src="/landing/hero-image.png"
          alt="NXL paintball players in action on the field"
          className="absolute inset-0 h-full w-full scale-[1.02] object-cover brightness-[0.95] contrast-110 saturate-110"
          style={{ objectPosition: "74% center" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-pickem-navy via-pickem-navy/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-pickem-navy/50 via-pickem-navy/20 to-transparent" />
      </div>

      <div className="container relative mx-auto flex min-h-[90vh] flex-col items-start justify-end px-4 pb-24 pt-20 md:items-start md:justify-center md:px-6 md:pb-20">
        <h1 className="hero-tagline font-industry-ultra mb-6 max-w-3xl text-6xl font-bold leading-[0.9] tracking-tight text-primary-foreground md:text-8xl lg:text-9xl">
          Every Kill
          <br />
          <span className="text-pickem-green">Counts.</span>
        </h1>

        <ul className="mb-10 max-w-lg space-y-2 font-body text-lg text-primary-foreground/70 md:text-xl">
          <li>✓ Live player stats</li>
          <li>✓ Free to play Fantasy Paintball</li>
          <li>✓ Built by fans, for the fans</li>
        </ul>

        <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
          <Button
            asChild
            size="lg"
            className="w-full bg-pickem-green px-8 font-heading text-base font-bold uppercase tracking-wider text-pickem-navy hover:bg-pickem-green/90 sm:w-auto"
          >
            <Link href="/register">
              Join Now
              <ChevronRight className="ml-1 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>

      <a
        href="#mission"
        className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-primary-foreground/50 transition-colors hover:text-primary-foreground/80 md:bottom-16"
      >
        <span className="font-body text-xs uppercase tracking-widest">
          See more
        </span>
        <ChevronDown className="h-5 w-5 animate-bounce" />
      </a>

      <div className="absolute -bottom-1 left-0 right-0">
        <svg
          viewBox="0 0 1440 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full"
          aria-hidden
        >
          <path
            d="M0 60H1440V20L0 60Z"
            fill="hsl(var(--background))"
          />
        </svg>
      </div>
    </section>
  );
};

export default HeroSection;
