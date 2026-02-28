import { useMemo } from "react";
import { motion } from "framer-motion";

const PARTICLE_COUNT = 50;
const COLORS = [
  "#eab308", // gold
  "#22c55e", // green
  "#3b82f6", // blue
  "#f43f5e", // rose
  "#a855f7", // purple
  "#f97316", // orange
  "#06b6d4", // cyan
  "#ffffff", // white
];

interface Particle {
  id: number;
  x: number;
  color: string;
  size: number;
  angle: number;
  speed: number;
  spin: number;
  delay: number;
  isCircle: boolean;
}

export function ConfettiEffect() {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 20, // % from center
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      size: 4 + Math.random() * 6,
      angle: -90 + (Math.random() - 0.5) * 120, // spread upward
      speed: 300 + Math.random() * 400,
      spin: (Math.random() - 0.5) * 720,
      delay: Math.random() * 0.15,
      isCircle: Math.random() > 0.5,
    }));
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 20,
        overflow: "hidden",
      }}
    >
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180;
        const vx = Math.cos(rad) * p.speed;
        const vy = Math.sin(rad) * p.speed;
        // Gravity simulation via keyframes at 0%, 33%, 66%, 100%
        const gravity = 800;
        const t1 = 0.5, t2 = 1.0, t3 = 1.5;
        const xFrames = [0, vx * t1, vx * t2, vx * t3];
        const yFrames = [
          0,
          vy * t1 + 0.5 * gravity * t1 * t1,
          vy * t2 + 0.5 * gravity * t2 * t2,
          vy * t3 + 0.5 * gravity * t3 * t3,
        ];

        return (
          <motion.div
            key={p.id}
            initial={{
              x: 0,
              y: 0,
              rotate: 0,
              opacity: 1,
              scale: 1,
            }}
            animate={{
              x: xFrames,
              y: yFrames,
              rotate: p.spin,
              opacity: [1, 1, 0.8, 0],
              scale: [1, 1, 0.8, 0.5],
            }}
            transition={{
              duration: 1.5,
              ease: "easeOut",
              delay: p.delay,
            }}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: "35%",
              width: p.size,
              height: p.isCircle ? p.size : p.size * 1.6,
              borderRadius: p.isCircle ? "50%" : 2,
              backgroundColor: p.color,
              willChange: "transform, opacity",
            }}
          />
        );
      })}
    </div>
  );
}
