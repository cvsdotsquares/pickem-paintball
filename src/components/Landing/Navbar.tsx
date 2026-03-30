"use client";

import Link from "next/link";
import { Button } from "@/src/components/Landing/ui/button";

const Navbar = () => {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container relative mx-auto flex h-16 w-full max-w-[100vw] items-center justify-between gap-2 px-4 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:justify-normal md:gap-4 md:px-6">
        {/* Desktop only: balances center logo */}
        <div className="hidden min-w-0 md:block" aria-hidden="true" />

        {/* Mobile: far left · md+: centered column */}
        <div className="flex shrink-0 justify-start md:justify-center">
          <Link href="/" className="flex items-center">
            <img
              src="/landing/logo.png"
              alt="PickEm Paintball"
              className="h-12 w-auto md:h-14"
            />
          </Link>
        </div>

        {/* Top right: Login + Join Now */}
        <div className="flex min-w-0 items-center justify-end gap-3 md:gap-4">
          <Link
            href="/login"
            className="shrink-0 font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            Login
          </Link>
          <Button
            asChild
            size="sm"
            className="shrink-0 bg-pickem-green px-4 font-heading text-xs font-bold uppercase tracking-wider text-pickem-navy shadow-sm hover:bg-pickem-green/90 md:px-5 md:text-sm"
          >
            <Link href="/register">Join Now</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
