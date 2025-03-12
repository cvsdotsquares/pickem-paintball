import Header from "../components/Landing/header";
import { HeroSection } from "../components/Landing/hero";
import { NewsTicker } from "../components/ui/ticker";


export default function Home() {
  return (
    <main className="relative w-full text-center uppercase bg-white">

      {/* <Auth /> */}

      {/* <NavBar /> */}
      <div className="fixed top-0 left-0 right-0 z-40">
        <Header />
      </div>

      <HeroSection />
      <NewsTicker />
    </main>
  );
}