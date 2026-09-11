"use client";;
import { forwardRef, useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fontWeights } from "@/lib/font-weight";
import { useSize } from "@/lib/size-context";

const circleA =
  "M12 8 C14.21 8 16 9.79 16 12 C16 14.21 14.21 16 12 16 C9.79 16 8 14.21 8 12 C8 9.79 9.79 8 12 8 Z";

const infinity =
  "M8 12 C8 8.5 10 7 12 12 C14 17 16 15.5 16 12 C16 8.5 14 7 12 12 C10 17 8 15.5 8 12 Z";

const circleB =
  "M12 16 C14.21 16 16 17.79 16 20 C16 22.21 14.21 24 12 24 C9.79 24 8 22.21 8 20 C8 17.79 9.79 16 12 16 Z";

const defaultWords = ["Thinking", "Analyzing", "Almost done"];

const ThinkingIndicator = forwardRef(({ className, showIcon = true, size, label, ...props }, ref) => {
const compactStep = useSize(size).variant === "compact";
const [index, setIndex] = useState(0);
const reduceMotion = useReducedMotion() ?? false;

// When a custom label is provided, use it as a single cycling set
const words = label ? [label, "Almost done"] : defaultWords;

useEffect(() => {
  if (reduceMotion) return;
  const interval = setInterval(() => {
    setIndex((i) => (i + 1) % words.length);
  }, 2300);
  return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [reduceMotion, label]);

// Reset index when label changes
useEffect(() => {
  setIndex(0);
}, [label]);

return (
  <div
    ref={ref}
    role="status"
    className={cn("flex items-center gap-2 px-3 py-2", className)}
    {...props}>
    <span className="sr-only">Thinking…</span>
    {showIcon && (
      <motion.svg
        aria-hidden
        width={compactStep ? 18 : 20}
        height={compactStep ? 18 : 20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-oklch(0.556 0 0) shrink-0 dark:text-oklch(0.708 0 0)">
        {reduceMotion ? (
          <path d={infinity} />
        ) : (
          <motion.path
            d={circleA}
            initial={{ d: circleA }}
            animate={{
              d: [circleA, infinity, circleB, infinity, circleA],
            }}
            transition={{
              d: {
                duration: 6,
                ease: "easeInOut",
                repeat: Infinity,
                times: [0, 0.25, 0.5, 0.75, 1.0],
              },
            }} />
        )}
      </motion.svg>
    )}
    <span
      aria-hidden="true"
      className={cn("inline-grid overflow-hidden", compactStep ? "text-[12px]" : "text-[13px]")}
      style={{ fontVariationSettings: fontWeights.medium }}>
      <span className="col-start-1 row-start-1 invisible shimmer-text">
        {words.reduce((a, b) => (a.length >= b.length ? a : b))}
      </span>
      {reduceMotion ? (
        <span className="col-start-1 row-start-1 shimmer-text">
          {words[0]}
        </span>
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={words[index]}
            className="col-start-1 row-start-1 shimmer-text"
            initial={{ y: "80%", opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] } }}
            exit={{ y: "-80%", opacity: 0, transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] } }}>
            {words[index]}
          </motion.span>
        </AnimatePresence>
      )}
    </span>
  </div>
);
});

ThinkingIndicator.displayName = "ThinkingIndicator";

export { ThinkingIndicator };
export default ThinkingIndicator;
