import Link from "next/link";

export type TermsAndConditionsVariant = "landing" | "dashboard";

const LAST_UPDATED = "12 April 2026";

function privacyPolicyHref(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL;
  if (base) return `${base.replace(/\/$/, "")}/pages/privacy-policy`;
  return "/pages/privacy-policy";
}

function privacyPolicyLabel(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL;
  if (base) return `${base.replace(/\/$/, "")}/pages/privacy-policy`;
  return "https://pickempaintball.com/pages/privacy-policy";
}

export default function TermsAndConditionsContent({
  variant,
}: {
  variant: TermsAndConditionsVariant;
}) {
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
  const privacyHref = privacyPolicyHref();
  const privacyLabel = privacyPolicyLabel();

  return (
    <div className={variant === "landing" ? "" : "max-w-none"}>
      <p className={`mb-6 ${bodyClass}`}>Last Updated: {LAST_UPDATED}</p>

      <h1 className={h1Class}>Terms and Conditions</h1>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>1. Introduction and Company Information</h2>
        <p className={bodyClass}>
          1.1. Welcome to Pick&apos;Em Paintball (&quot;Website&quot;). These Terms and Conditions
          (&quot;Terms&quot;) govern your use of our Website and services.
        </p>
        <p className={bodyClass}>
          1.2. The Website is operated by Pick&apos;Em Paintball Ltd, a company registered in England
          and Wales under Company Number 16335311 (&quot;the Company,&quot; &quot;we,&quot; &quot;us,&quot; or
          &quot;our&quot;).
        </p>
        <p className={bodyClass}>
          1.3. By accessing or using our Website, you agree to be bound by these Terms. If you do not
          agree, please refrain from using our Website.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>2. Eligibility</h2>
        <p className={bodyClass}>
          2.1. The Website is intended for users who are at least 18 years of age.
        </p>
        <p className={bodyClass}>
          2.2. Users under the age of 18 may use the Website only with the involvement and consent of a
          parent or legal guardian.
        </p>
        <p className={bodyClass}>
          2.3. By using this Website, you represent that you have the legal capacity to enter into these
          Terms and comply with all local regulations.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>3. Nature of Service (Non-Gambling)</h2>
        <p className={bodyClass}>
          3.1. Pick&apos;Em Paintball is a free-to-play sports analytics and fan engagement platform.
        </p>
        <p className={bodyClass}>
          3.2. We do not offer, facilitate, or encourage real-money gambling, sports betting, or wagering of
          any kind.
        </p>
        <p className={bodyClass}>
          3.3. Any &quot;Pick&apos;Em&quot; challenges, leaderboards, or points are provided solely for
          entertainment and community engagement purposes. No purchase or payment is required to
          participate in our prediction leagues.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>4. Use of the Website</h2>
        <p className={bodyClass}>4.1. The Website is for personal, non-commercial use only.</p>
        <p className={bodyClass}>
          4.2. You may not copy, distribute, or use any part of the Website, including its stats,
          software, or data, for commercial purposes without prior written consent.
        </p>
        <p className={bodyClass}>
          4.3. Unauthorized use of automated systems, including bots, scrapers, or data mining tools, is
          strictly prohibited.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>5. Intellectual Property</h2>
        <p className={bodyClass}>
          5.1. All content, trademarks, graphics, logos, and software on the Website are owned by
          Pick&apos;Em Paintball Ltd or its licensors.
        </p>
        <p className={bodyClass}>
          5.2. You may not modify, reproduce, or distribute any content without our prior written
          permission.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>6. User Conduct</h2>
        <p className={bodyClass}>6.1. You agree not to:</p>
        <ul className={`list-disc space-y-2 pl-6 ${bodyClass}`}>
          <li>Violate any applicable laws or regulations in the United Kingdom or the United States.</li>
          <li>Upload or share harmful, abusive, or illegal content.</li>
          <li>
            Interfere with the Website&apos;s operation or attempt to bypass security measures.
          </li>
        </ul>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>7. Privacy and Data Collection</h2>
        <p className={bodyClass}>
          7.1. Your privacy is important to us. Our Privacy Policy (available at{" "}
          <Link
            href={privacyHref}
            className={
              variant === "landing"
                ? "underline text-orange-400 hover:text-orange-300"
                : "underline text-orange-600 hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300"
            }
          >
            {privacyLabel}
          </Link>
          ) governs the collection and use of your personal data. By using the Website, you acknowledge
          the terms of our Privacy Policy.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>8. User-Generated Content</h2>
        <p className={bodyClass}>
          8.1. Users retain ownership of any content they submit (such as usernames or comments) but
          grant the Company a worldwide, royalty-free license to use and display this content in
          connection with the Service.
        </p>
        <p className={bodyClass}>
          8.2. Prohibited content includes offensive, illegal, or harmful material. We reserve the right to
          remove any content at our discretion.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>9. Disclaimers and Limitation of Liability</h2>
        <p className={bodyClass}>
          9.1. The Website is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
          any kind.
        </p>
        <p className={bodyClass}>
          9.2. We do not guarantee that the statistics, player data, or leaderboard updates are 100%
          accurate, complete, or real-time.
        </p>
        <p className={bodyClass}>
          9.3. To the fullest extent permitted by law, Pick&apos;Em Paintball Ltd disclaims liability for
          any direct or indirect losses arising from your use of the Website.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>10. External Links</h2>
        <p className={bodyClass}>
          10.1. The Website contains links to third-party websites (e.g., social media or event
          organizers). We do not endorse or take responsibility for the content, privacy policies, or
          practices of these external sites.
        </p>
        <p className={bodyClass}>10.2. Accessing linked websites is done at your own risk.</p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>11. Modifications to Terms</h2>
        <p className={bodyClass}>
          11.1. We reserve the right to update these Terms at any time. The &quot;Last Updated&quot; date at
          the top will reflect the most recent changes.
        </p>
        <p className={bodyClass}>
          11.2. Continued use of the Website after updates constitutes your acceptance of the revised
          Terms.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>12. Governing Law and Jurisdiction</h2>
        <p className={bodyClass}>
          12.1. These Terms shall be governed by and construed in accordance with the laws of England and
          Wales.
        </p>
        <p className={bodyClass}>
          12.2. For users in the United States, certain disputes may be governed by the laws of the State of
          Delaware where applicable.
        </p>
        <p className={bodyClass}>
          12.3. Any legal proceedings shall be subject to the exclusive jurisdiction of the courts of
          England and Wales.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>13. Termination</h2>
        <p className={bodyClass}>
          13.1. We reserve the right to suspend or terminate your access to the Website at any time,
          without notice, for conduct that we believe violates these Terms or is harmful to other users or
          the Company.
        </p>
      </section>

      <section className="space-y-4 pb-4">
        <h2 className={h2Class}>14. Contact Information</h2>
        <p className={bodyClass}>
          If you have any questions or concerns regarding these Terms, please contact us at:
          <br />
          Email:{" "}
          <a
            href="mailto:james@pickempaintball.com"
            className={
              variant === "landing"
                ? "underline text-orange-400 hover:text-orange-300"
                : "underline text-orange-600 hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300"
            }
          >
            james@pickempaintball.com
          </a>
        </p>
      </section>
    </div>
  );
}
