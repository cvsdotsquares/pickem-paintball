import Image from "next/image";
import React from "react";
import { LuMoveDown } from "react-icons/lu";
const ScrollIndicator = () => {
    return (
        <div className="flex justify-center items-center shadow-2xl border-gray-300 border-[1px] backdrop-blur-sm bg-transparent h-[130px] rounded-[1000px] w-[72px] drop-shadow-lg ">
            <LuMoveDown className=" text-gray-200 h-[60px] w-[32px]" />
        </div>
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
            <h1 className="relative m-auto justify-center items-center font-extrabold tracking-tighter text-white/90 leading-[148px] max-w-screen text-8xl z-10">
                Explore paintball tactics for fun with friends.
            </h1>
            <div className="relative -top-40 z-20">
                <ScrollIndicator />
            </div>

        </section>
    );
};
