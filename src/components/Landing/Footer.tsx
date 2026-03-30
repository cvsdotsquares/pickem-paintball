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
        <Link
          href="/terms&conditions"
          className="absolute right-4 font-body text-xs text-white/40 hover:text-white/70 md:right-6"
        >
          Terms
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
