import { memo, useMemo } from "react";
import { getThemeForLevel, seededRandom, type DecorationType } from "./themes";
import "./backgroundStyles.css";

interface DecorationEl {
  key: number;
  size: number;
  x: number; // % from left
  y: number; // % from top
  opacity: number;
  color: string;
  blur: number;
  animation: string;
  duration: number;
  delay: number;
}

function generateDecorations(
  levelNumber: number,
  count: number,
  colors: string[],
  type: DecorationType,
): DecorationEl[] {
  const rand = seededRandom(levelNumber * 7919 + 127);
  const decorations: DecorationEl[] = [];

  for (let i = 0; i < count; i++) {
    const color = colors[Math.floor(rand() * colors.length)]!;
    const elType =
      type === "mixed"
        ? (["bubbles", "orbs", "sparkles"] as const)[Math.floor(rand() * 3)]!
        : type;

    let size: number;
    let blur: number;
    let opacity: number;
    let animation: string;
    let duration: number;

    switch (elType) {
      case "bubbles":
        size = 6 + rand() * 18;
        blur = 0;
        opacity = 0.04 + rand() * 0.08;
        animation = "bgRise";
        duration = 20 + rand() * 25;
        break;
      case "orbs":
        size = 30 + rand() * 80;
        blur = 20 + rand() * 40;
        opacity = 0.03 + rand() * 0.06;
        // Randomly pick between drift and swirl for orbs
        animation = rand() > 0.5 ? "bgDrift" : "bgSwirl";
        duration = 25 + rand() * 20;
        break;
      case "sparkles":
        size = 2 + rand() * 5;
        blur = 0;
        opacity = 0.05 + rand() * 0.12;
        // Sparkles now wander around instead of just pulsing in place
        animation = rand() > 0.4 ? "bgWander" : "bgPulse";
        duration = 8 + rand() * 12;
        break;
    }

    decorations.push({
      key: i,
      size,
      x: rand() * 100,
      y: rand() * 100,
      opacity,
      color,
      blur,
      animation,
      duration,
      delay: rand() * -duration, // negative delay = start at random phase
    });
  }

  return decorations;
}

interface WorldBackgroundProps {
  levelNumber: number;
}

export const WorldBackground = memo(function WorldBackground({
  levelNumber,
}: WorldBackgroundProps) {
  const theme = useMemo(() => getThemeForLevel(levelNumber), [levelNumber]);

  const decorations = useMemo(
    () =>
      generateDecorations(
        levelNumber,
        theme.decorationCount,
        theme.accentColors,
        theme.decorationType,
      ),
    [levelNumber, theme],
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        background: theme.gradient,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {decorations.map((d) => (
        <div
          key={d.key}
          style={{
            position: "absolute",
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.size,
            height: d.size,
            borderRadius: "50%",
            backgroundColor: d.color,
            opacity: d.opacity,
            filter: d.blur > 0 ? `blur(${d.blur}px)` : undefined,
            animation: `${d.animation} ${d.duration}s ease-in-out ${d.delay}s infinite`,
            willChange: "transform, opacity",
            // Pass opacity to CSS variable for keyframe reference
            ["--bg-el-opacity" as string]: d.opacity,
          }}
        />
      ))}
    </div>
  );
});
