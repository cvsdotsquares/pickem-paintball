"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import React from "react";
import { useRouter } from "next/navigation";
import { LuMoveDown } from "react-icons/lu";
import Button from "../ui/button";
const ScrollIndicator = () => {
  return (
    <motion.div
      animate={{
        y: [0, -10, 0], // Keyframes for up and down motion
      }}
      transition={{
        duration: 1.5, // Time for one full loop
        repeat: Infinity, // Repeat indefinitely
        ease: "easeInOut", // Smooth easing
      }}
    >
      <div className="flex justify-center items-center shadow-2xl border-gray-300 border-[1px] backdrop-blur-sm bg-transparent h-[130px] rounded-[1000px] w-[72px] drop-shadow-lg ">
        <LuMoveDown className=" text-gray-200 h-[60px] w-[32px]" />
      </div>
    </motion.div>
  );
};
export const HeroSection = () => {
  const router = useRouter();
  const handleGoToApp = () => {
    router.push("/dashboard");
  };

  return (
    <section className="flex relative top-0 flex-col items-center w-full text-black h-screen">
      <Image
        src="/bg.jpg"
        width={600}
        height={600}
        alt="Paintball players"
        className="object-cover absolute inset-0 brightness-[0.7] contrast-[110%] filter saturate-[120%]  size-full"
      />
      <h1 className="relative p-2 my-auto whitespace-break-spaces  items-center font-extrabold font-inter text-justify tracking-tight text-white/90 leading-loose max-w-screen md:text-7xl text-2xl z-10">
        <span className=" text-pretty mx-auto md:-ml-10 -ml-4 -mb-6 justify-start flex flex-row gap-2">
          Pick&apos;em Paintball{"\n"}
          {"\n"}
        </span>
        <span className=" text-pretty md:ml-16 justify-center flex flex-row gap-2">
          Every pick matters
          {"\n"}
        </span>
        <span className=" text-pretty text-right justify-end mr-10 mt-8 flex flex-row gap-2">
          <div className="flex text-center text-black">
            <Button
              onClick={handleGoToApp}
              className="flex justify-center gap-2 items-center mx-auto shadow-xl text-xl hover:bg-white bg-gray-50 backdrop-blur-md lg:font-semibold isolation-auto border-black before:absolute before:w-full before:transition-all before:duration-700 before:hover:w-full before:-left-full before:hover:left-0 before:rounded-full before:bg-black hover:text-white before:-z-10 before:aspect-square before:hover:scale-150 before:hover:duration-700 relative z-10 px-4 py-2 overflow-hidden border-2 rounded-full group"
            >
              Sign up now
            </Button>
          </div>
          {"\n"}
        </span>
      </h1>
      {/* <div className="relative -top-40 z-20">
        <ScrollIndicator />
      </div> */}
    </section>
  );
};
