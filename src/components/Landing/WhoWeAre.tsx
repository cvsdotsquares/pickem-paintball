const WhoWeAre = () => {
  return (
    <section
      id="who-we-are"
      className="relative scroll-mt-20 bg-pickem-navy py-6 md:py-10"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-10 text-center">
          <h2 className="font-heading text-3xl font-bold uppercase tracking-wide text-white md:text-5xl">
            Who We Are
          </h2>
          <div className="mx-auto mt-5 h-1 w-28 rounded-full bg-pickem-green" />
        </div>

        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col items-center gap-8 md:flex-row md:items-center md:gap-12">
            <div className="flex-shrink-0">
              <div className="h-48 w-48 overflow-hidden rounded-full border-4 border-pickem-green md:h-64 md:w-64">
                <img
                  src="/landing/founder.jpg"
                  alt="Founder"
                  className="h-full w-full object-cover object-top"
                />
              </div>
            </div>

            <blockquote className="text-center md:text-left">
              <p className="font-body text-lg italic leading-relaxed text-white/80 md:text-xl">
                <span className="text-2xl text-pickem-green md:text-3xl">
                  &ldquo;
                </span>
                Pick&apos;Em is the natural intersection of two of my biggest
                passions, paintball, where I&apos;ve competed for 19 years, and
                data, in which I&apos;ve worked for almost a decade.
              </p>
              <p className="mt-4 font-body text-lg italic leading-relaxed text-white/80 md:text-xl">
                We&apos;re a team of volunteers building in the open so we can
                listen to the community and improve. Our goal is simple: get a
                little bit better every event until we&apos;ve built the platform
                this sport deserves.
              </p>
              <p className="mt-4 font-body text-lg italic leading-relaxed text-white/80 md:text-xl">
                Thank you for supporting this journey.
                <span className="text-2xl text-pickem-green md:text-3xl">
                  &rdquo;
                </span>
              </p>
            </blockquote>
          </div>

          <div className="mt-6 text-center md:ml-[calc(16rem+3rem)] md:text-left">
            <p className="font-heading text-lg font-bold text-white">
              James Green, Lucky 15s
            </p>
            <p className="font-body text-sm text-pickem-green">
              Founder, Pick&apos;Em Paintball
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhoWeAre;
