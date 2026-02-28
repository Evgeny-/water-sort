import { useEffect, useState, useRef, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  animate,
} from "framer-motion";
import { IoStar } from "react-icons/io5";
import { audioManager } from "../audio/audioManager";

interface ScoreDonutProps {
  score: number;
  referenceMax: number;
  stars: number;
  onFillComplete: () => void;
  startDelay: number;
}

// SVG semicircular arc geometry
const CX = 100;
const CY = 120;
const R = 80;
const STROKE = 12;
const ARC_LENGTH = Math.PI * R; // semicircle circumference

export function ScoreDonut({
  score,
  referenceMax,
  stars,
  onFillComplete,
  startDelay,
}: ScoreDonutProps) {
  const fillPercent = Math.min(score / Math.max(referenceMax, 1), 1);
  const progress = useMotionValue(0);
  const [activeStars, setActiveStars] = useState([false, false, false]);
  const [displayScore, setDisplayScore] = useState(0);
  const completeFired = useRef(false);

  // Activate earned stars when fill completes
  const handleFillDone = useCallback(() => {
    // Activate stars sequentially with staggered delays
    for (let i = 0; i < stars; i++) {
      setTimeout(() => {
        audioManager.playStar(i);
        setActiveStars((prev) => {
          if (prev[i]) return prev;
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, i * 200);
    }
    setDisplayScore(score);
  }, [stars, score]);

  // Drive the fill animation
  useEffect(() => {
    const controls = animate(progress, fillPercent, {
      duration: 1.8,
      ease: "easeOut",
      delay: startDelay,
      onComplete: () => {
        if (!completeFired.current) {
          completeFired.current = true;
          handleFillDone();
          onFillComplete();
        }
      },
    });
    return controls.stop;
  }, [fillPercent, startDelay, progress, onFillComplete, handleFillDone]);

  // Watch progress for score counter
  useMotionValueEvent(progress, "change", (latest) => {
    setDisplayScore(
      Math.round((latest / Math.max(fillPercent, 0.001)) * score),
    );
  });

  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    <div
      style={{
        position: "relative",
        width: 200,
        height: 150,
        margin: "0 auto 8px",
      }}
    >
      <svg viewBox="0 0 200 150" width="200" height="150">
        <defs>
          <linearGradient id="donut-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="60%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>

        {/* Background arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="rgba(148, 163, 184, 0.15)"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />

        {/* Progress arc */}
        <motion.path
          d={arcPath}
          fill="none"
          stroke="url(#donut-gradient)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={ARC_LENGTH}
          initial={{ strokeDashoffset: ARC_LENGTH }}
          animate={{ strokeDashoffset: ARC_LENGTH * (1 - fillPercent) }}
          transition={{
            duration: 1.8,
            ease: "easeOut",
            delay: startDelay,
          }}
        />
      </svg>

      {/* Stars row — just below the arc */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 54,
          display: "flex",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {[0, 1, 2].map((i) => {
          const active = activeStars[i];
          const earned = i < stars;
          return (
            <motion.span
              key={i}
              initial={{ scale: 0.8, opacity: 0.3 }}
              animate={
                active
                  ? { scale: [0.8, 1.5, 1], opacity: 1 }
                  : { scale: 0.8, opacity: 0.3 }
              }
              transition={
                active
                  ? { type: "spring", stiffness: 400, damping: 12 }
                  : { duration: 0 }
              }
              style={{
                fontSize: 22,
                color: "#eab308",
                filter: active
                  ? "drop-shadow(0 0 8px rgba(234, 179, 8, 0.7))"
                  : earned
                    ? "grayscale(0.5) opacity(0.5)"
                    : "grayscale(1) opacity(0.3)",
                lineHeight: 1,
              }}
            >
              <IoStar />
            </motion.span>
          );
        })}
      </div>

      {/* Score number — inside the donut */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 16,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            background: "linear-gradient(135deg, #f8fafc 0%, #eab308 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            lineHeight: 1,
          }}
        >
          {displayScore}
        </div>
      </div>
    </div>
  );
}
