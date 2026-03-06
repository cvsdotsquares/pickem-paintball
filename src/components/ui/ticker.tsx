"use client";

import React from "react";
import { GiGooeyMolecule } from "react-icons/gi";
import { motion } from "framer-motion";

const baseItems = [
  "Pick your squad",
  "Follow the action live",
  "Collect kills",
  "Climb the leaderboard",
];

const TickerItem = ({ text }: { text: string }) => (
  <div className="flex items-center gap-3 px-10 whitespace-nowrap">
    <GiGooeyMolecule className="w-5 h-5" />
    <span className="font-bold text-sm sm:text-base">{text}</span>
  </div>
);

export const NewsTicker = () => {

  // repeat items many times so width always bigger than screen
  const items = Array(10).fill(baseItems).flat();

  return (
    <div className="w-full overflow-hidden bg-neutral-200 py-2">
      <motion.div
        className="flex w-max"
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          duration: 50,
          ease: "linear",
          repeat: Infinity,
        }}
      >
        {items.map((text, i) => (
          <TickerItem key={i} text={text} />
        ))}
      </motion.div>
    </div>
  );
};