const MissionStatement = () => {
  return (
    <section id="mission" className="relative bg-background">
      <div className="relative z-10 py-14 md:py-20">
        <div className="container mx-auto max-w-3xl px-4 text-center md:px-6">
          <h2 className="font-heading text-3xl font-bold leading-tight text-foreground md:text-5xl lg:text-6xl">
            Built by fans,{" "}
            <span className="text-pickem-green">for fans</span>
          </h2>

          <div className="mx-auto mb-6 mt-5 h-1 w-28 rounded-full bg-pickem-green" />

          <div className="space-y-4 font-body text-lg leading-relaxed text-muted-foreground md:text-xl">
            <p>We&apos;re here to help grow paintball.</p>
            <p>
              We believe stats will help legitimise the sport, and create more
              stories for fans to buy into.
            </p>
            <p className="font-heading text-2xl font-semibold text-foreground md:text-3xl">
              Pick&apos;Em exists to make that happen.
            </p>
          </div>
        </div>
      </div>

      <div className="relative -mt-28 h-80 md:-mt-56 md:h-[34rem]">
        <img
          src="/landing/fans-crowd.png"
          alt="Paintball fans cheering in the stands"
          className="h-full w-full object-cover object-top"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-transparent"
          style={{
            backgroundSize: "100% 100%",
            backgroundImage:
              "linear-gradient(to bottom, hsl(var(--background)) 0%, hsl(var(--background) / 0.6) 20%, transparent 40%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-pickem-navy to-transparent md:h-48" />
      </div>
    </section>
  );
};

export default MissionStatement;
