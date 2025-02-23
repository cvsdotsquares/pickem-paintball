import Header from "../components/header";
import { HeroSection } from "../components/hero";
import { NewsTicker } from "../components/ticker";


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