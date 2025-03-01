"use client"

import { motion } from "framer-motion";
import Image from "next/image";
import React from "react";
import { GiGooeyImpact, GiGooeyMolecule } from "react-icons/gi";
import { LuMoveDown } from "react-icons/lu";
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
    return (
        <section className="flex relative top-0 flex-col items-center w-full text-black md:h-screen h-[80vh]">
            <Image
                src="/bg.jpg"
                width={600}
                height={600}
                alt="Paintball players"
                className="object-cover absolute inset-0 brightness-[0.7] contrast-[110%] filter saturate-[120%]  size-full"
            />
            <h1 className="relative my-auto whitespace-break-spaces  items-center font-extrabold font-inter text-justify tracking-tight text-white/90 leading-loose max-w-screen md:text-7xl text-3xl z-10">
                <span className=" text-pretty mx-auto -ml-10 -mb-6 justify-start flex flex-row gap-2">
                    Pick&apos;em Paintball{"\n"}
                    {"\n"}</span>
                <span className=" text-pretty ml-16 justify-center flex flex-row gap-2"><GiGooeyMolecule />
                    Every pick matters
                    {"\n"}</span>
                <span className=" text-pretty text-right justify-end mr-10 mt-8 flex flex-row gap-2"><GiGooeyMolecule />
                    Sign up now
                    {"\n"}</span>

            </h1>
            <div className="relative -top-40 z-20">
                <ScrollIndicator />
            </div>

        </section>
    );
};
