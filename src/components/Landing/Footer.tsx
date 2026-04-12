import Link from "next/link";

const Footer = () => {
  return (
    <footer className="border-t border-white/10 bg-pickem-navy-dark py-10">
      <div className="container relative mx-auto flex items-center justify-center px-4 md:px-6">
        <img
          src="/landing/logo-footer.svg"
          alt="Pick&apos;Em Paintball"
          className="h-14 w-auto"
        />
        <nav
          className="absolute right-4 flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-xs text-white/40 md:right-6"
          aria-label="Legal"
        >
          <Link href="/pages/terms-and-conditions" className="hover:text-white/70">
            Terms &amp; Conditions
          </Link>
          <span aria-hidden className="text-white/25">
            ·
          </span>
          <Link href="/pages/privacy-policy" className="hover:text-white/70">
            Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
};

export default Footer;
