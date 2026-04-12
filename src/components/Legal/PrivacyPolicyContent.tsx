export type PrivacyPolicyVariant = "landing" | "dashboard";

const LAST_UPDATED = "12 April 2026";

export default function PrivacyPolicyContent({ variant }: { variant: PrivacyPolicyVariant }) {
  const h1Class =
    variant === "landing"
      ? "text-3xl font-bold mb-4 text-orange-600"
      : "text-2xl font-bold mb-4 text-orange-600 dark:text-orange-400 md:text-3xl";
  const h2Class =
    variant === "landing"
      ? "font-bold text-orange-300 mt-8 first:mt-0"
      : "font-bold text-orange-600 dark:text-orange-400 mt-8 first:mt-0";
  const bodyClass =
    variant === "landing"
      ? "text-base leading-relaxed text-white/95"
      : "text-base leading-relaxed text-gray-900 dark:text-stone-100";
  const linkClass =
    variant === "landing"
      ? "underline text-orange-400 hover:text-orange-300"
      : "underline text-orange-600 hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300";

  return (
    <div className={variant === "landing" ? "" : "max-w-none"}>
      <p className={`mb-6 ${bodyClass}`}>Last Updated: {LAST_UPDATED}</p>

      <h1 className={h1Class}>Privacy Policy</h1>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>1. Introduction</h2>
        <p className={bodyClass}>
          Pick&apos;Em Paintball Ltd (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) respects your privacy
          and is committed to protecting your personal data. This Privacy Policy informs you how we look
          after your personal data when you visit our website (pickempaintball.com) and tells you about
          your privacy rights and how the law protects you.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>2. The Data We Collect</h2>
        <p className={bodyClass}>
          We may collect, use, store, and transfer different kinds of personal data about you, including:
        </p>
        <ul className={`list-disc space-y-2 pl-6 ${bodyClass}`}>
          <li>
            <span className="font-semibold">Identity Data:</span> Usernames or similar identifiers.
          </li>
          <li>
            <span className="font-semibold">Contact Data:</span> Email address.
          </li>
          <li>
            <span className="font-semibold">Technical Data:</span> IP address, browser type and version,
            and operating system.
          </li>
          <li>
            <span className="font-semibold">Usage Data:</span> Information about how you use our website,
            stats, and prediction leagues.
          </li>
        </ul>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>3. How We Use Your Data</h2>
        <p className={bodyClass}>
          We will only use your personal data when the law allows us to. Most commonly, we use your data
          to:
        </p>
        <ul className={`list-disc space-y-2 pl-6 ${bodyClass}`}>
          <li>Register you as a new user and manage your account.</li>
          <li>Operate our leaderboard and community prediction leagues.</li>
          <li>Improve our website, statistics, and user experience.</li>
          <li>Comply with a legal or regulatory obligation.</li>
        </ul>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>4. Legal Basis for Processing</h2>
        <p className={bodyClass}>We process your data based on:</p>
        <ul className={`list-disc space-y-2 pl-6 ${bodyClass}`}>
          <li>
            <span className="font-semibold">Consent:</span> When you voluntarily provide your email to
            create an account.
          </li>
          <li>
            <span className="font-semibold">Legitimate Interests:</span> Necessary for our legitimate
            interests to run our business and provide a platform for the paintball community, provided
            your interests and fundamental rights do not override those interests.
          </li>
        </ul>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>5. Data Sharing and Transfers</h2>
        <p className={bodyClass}>
          We do not sell your personal data. We may share your data with trusted third-party service
          providers (such as website hosting and analytics providers) who help us operate our platform.
          These providers are required to protect your data in accordance with the law.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>6. Data Security</h2>
        <p className={bodyClass}>
          We have put in place appropriate security measures to prevent your personal data from being
          accidentally lost, used, or accessed in an unauthorized way. We limit access to your personal
          data to those employees and partners who have a business need to know.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>7. Data Retention</h2>
        <p className={bodyClass}>
          We will only retain your personal data for as long as necessary to fulfill the purposes we
          collected it for, including for the purposes of satisfying any legal, accounting, or reporting
          requirements.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>8. Your Legal Rights (UK GDPR)</h2>
        <p className={bodyClass}>
          Under the UK General Data Protection Regulation, you have rights including:
        </p>
        <ul className={`list-disc space-y-2 pl-6 ${bodyClass}`}>
          <li>
            <span className="font-semibold">Access:</span> The right to ask us for copies of your personal
            information.
          </li>
          <li>
            <span className="font-semibold">Rectification:</span> The right to ask us to correct information
            you think is inaccurate.
          </li>
          <li>
            <span className="font-semibold">Erasure:</span> The right to ask us to erase your personal
            information.
          </li>
          <li>
            <span className="font-semibold">Object to processing:</span> The right to object to the
            processing of your personal data.
          </li>
        </ul>
        <p className={bodyClass}>
          To exercise any of these rights, please contact us at{" "}
          <a href="mailto:james@pickempaintball.com" className={linkClass}>
            james@pickempaintball.com
          </a>
          .
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>9. Contact Details</h2>
        <p className={bodyClass}>
          Pick&apos;Em Paintball Ltd (Company Number: 16335311)
          <br />
          Email:{" "}
          <a href="mailto:james@pickempaintball.com" className={linkClass}>
            james@pickempaintball.com
          </a>
        </p>
      </section>
    </div>
  );
}
