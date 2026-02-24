"use client";

import React, { useRef } from "react";
import { GiGooeyMolecule } from "react-icons/gi";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";

interface TickerItemProps {
    text: string;
}

const TickerItem: React.FC<TickerItemProps> = ({ text }) => {
    return (
        <div className="flex gap-6 items-center p-2 whitespace-nowrap">
            <GiGooeyMolecule
                color="black"
                className=" h-[32px] w-[50px] max-sm:h-[20px] max-sm:w-[20px]"
            />
            <span className="text-black font-bold">{text}</span>
        </div>
    );
};

export const NewsTicker: React.FC = () => {
    const targetRef = useRef<HTMLElement>(null);

    const { scrollYProgress } = useScroll({
        target: targetRef,
        offset: ["start end", "end start"],
    });

    const xRaw = useTransform(scrollYProgress, [0, 1], [0, -1000]);
    useSpring(xRaw, { mass: 1, stiffness: 150, damping: 25 });

    const tickerItems = [
        "Pick your squad",
        "follow the action live",
        "collect kills",
        "climb the leaderboard",
    ];

    return (
        <section
            ref={targetRef}
            className="overflow-hidden px-0 py-4 w-full bg-neutral-200"
        >
            <div className="relative flex items-center text-xl tracking-tight uppercase">
                <motion.div
                    animate={{ x: ["0%", "-50%"] }}
                    transition={{ repeat: Infinity, duration: 30, ease: "linear", repeatType: "loop" }}
                    className="flex whitespace-nowrap gap-8"
                    style={{ width: "200%" }}
                >
                    {/* Render items twice for seamless infinite loop */}
                    {[...Array(2)].map((_, setIndex) => (
                        <React.Fragment key={setIndex}>
                            {tickerItems.map((text, index) => (
                                <TickerItem key={`${setIndex}-${index}`} text={text} />
                            ))}
                        </React.Fragment>
                    ))}
                </motion.div>
            </div>
        </section>
    );
};
