"use client";

import Navbar from "@/src/components/Landing/Navbar";
import HeroSection from "@/src/components/Landing/HeroSection";
import MissionStatement from "@/src/components/Landing/MissionStatement";
import ProductPreview from "@/src/components/Landing/ProductPreview";
import WhoWeAre from "@/src/components/Landing/WhoWeAre";
import JoinSupport from "@/src/components/Landing/JoinSupport";
import Footer from "@/src/components/Landing/Footer";

export default function LandingHome() {
  return (
    <div id="landing-root" className="landing-page min-h-screen">
      <Navbar />
      <HeroSection />
      <MissionStatement />
      <ProductPreview />
      <WhoWeAre />
      <JoinSupport />
      <Footer />
    </div>
  );
}
