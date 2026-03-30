import Link from "next/link";

const JoinSupport = () => {
  return (
    <section
      id="join-support"
      className="relative scroll-mt-20 bg-pickem-navy-dark py-16 md:py-24"
    >
      <div className="container mx-auto px-4 text-center md:px-6">
        <h2 className="font-heading text-3xl font-bold uppercase tracking-wide text-white md:text-5xl">
          Join &amp; Support
        </h2>
        <div className="mx-auto mt-5 h-1 w-28 rounded-full bg-pickem-green" />

        <p className="mx-auto mt-8 max-w-xl font-body text-lg text-white/70 md:text-xl">
          Be part of the movement. Sign up to compete, track your picks, and help
          grow the sport.
        </p>

        <Link
          href="/register"
          className="mt-8 inline-block rounded-lg bg-pickem-green px-10 py-4 font-heading text-lg font-bold uppercase tracking-wide text-pickem-navy transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-pickem-green/30"
        >
          Join Now
        </Link>
      </div>
    </section>
  );
};

export default JoinSupport;
