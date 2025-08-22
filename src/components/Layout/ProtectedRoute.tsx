// components/ProtectedRoute.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../../contexts/authProvider";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) {
      router.push("/login");
    }
  }, [user, router]);

  if (user === null) {
    return <CutoutTextLoader

      background="black"
      // NOTE: Using GIFs for the background looks super cool :)
      imgUrl="/bg.webp"
    />;
  }

  return <>{children}</>;
};

export const CutoutTextLoader = ({
  height,
  background,
  imgUrl,
}: any) => {
  return (
    <div className="relative h-screen w-full">
      <div
        className="absolute inset-0 z-0 brightness-125"
        style={{
          backgroundImage: `url(${imgUrl})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      />
      <div
        style={{ background }}
        className="absolute inset-0 animate-pulse z-10"
      />
      <div
        className="absolute inset-0 z-20 flex items-center justify-center"
        style={{
          fontSize: "clamp(3rem, 12vw, 10rem)",
          lineHeight: height,
        }}
      >
        <span
          className="font-black w-full text-center bg-blend-saturation bg-clip-text  text-transparent pointer-events-none"
          style={{
            backgroundImage: `url(${imgUrl})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        >
          Loading...
        </span>
      </div>
    </div>
  );
};


export default ProtectedRoute;
