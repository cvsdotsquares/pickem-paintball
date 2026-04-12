import TermsAndConditionsContent from "@/src/components/Legal/TermsAndConditionsContent";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <TermsAndConditionsContent variant="landing" />
      </div>
    </div>
  );
}
