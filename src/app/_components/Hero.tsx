// src/app/_components/Hero.tsx
//
// Marketplace homepage hero. "Get what you need, when you need it" animates
// in one letter after another (framer-motion stagger) on mount.

"use client";

import { motion } from "framer-motion";

const HEADLINE = "Get what you need, when you need it";

// Splitting on words (not raw characters) keeps line-wrapping sane while
// still animating letter-by-letter within each word.
const words = HEADLINE.split(" ");

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04 },
  },
};

const letter = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export default function Hero() {
  return (
    <section className="flex flex-col items-center justify-center text-center px-4 py-20 sm:py-28">
      <motion.h1
        variants={container}
        initial="hidden"
        animate="visible"
        className="text-3xl sm:text-5xl font-bold text-gray-900 max-w-3xl leading-tight"
        aria-label={HEADLINE}
      >
        {words.map((word, wordIndex) => (
          <span key={wordIndex} className="inline-block whitespace-nowrap">
            {word.split("").map((char, charIndex) => (
              <motion.span key={charIndex} variants={letter} className="inline-block">
                {char}
              </motion.span>
            ))}
            {wordIndex < words.length - 1 && <span className="inline-block">&nbsp;</span>}
          </span>
        ))}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: HEADLINE.length * 0.03, duration: 0.4 }}
        className="mt-4 text-gray-500 max-w-lg"
      >
        Buy, sell, and hire within your campus community.
      </motion.p>
    </section>
  );
}
