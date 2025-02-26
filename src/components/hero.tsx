"use client"

import { motion } from "framer-motion";
import Image from "next/image";
import React from "react";
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
        <section className="flex relative top-0 flex-col items-center w-full text-black min-h-screen ">
            <Image
                src="/bg.jpg"
                width={600}
                height={600}
                alt="Paintball players"
                className="object-cover absolute inset-0 brightness-[0.7] contrast-[110%] saturate-[120%] size-full"
            />
            <h1 className="relative m-auto whitespace-break-spaces justify-center items-center font-extrabold tracking-tight text-white/90 leading-loose max-w-screen md:text-8xl text-4xl z-10">
                Pick'em Paintball{"\n"}
                - Every pick matters - {"\n"}
                - Sign up now -
            </h1>
            <div className="relative -top-44 z-20">
                <ScrollIndicator />
            </div>

        </section>
    );
};
