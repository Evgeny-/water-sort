import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { type Tube as TubeType, TUBE_CAPACITY, COLORS } from "../game/types";
import { isTubeComplete } from "../game/engine";

/*
 * Bottle geometry (all values in px, 0,0 = top-left of the SVG viewBox)
 *
 *  ┌──neck──┐        neckWidth = 28
 *  │        │        neckHeight = 16
 *  ╲        ╱        shoulderHeight = 14  (taper from neck → body)
 *  │        │        bodyWidth = 50
 *  │  body  │        bodyHeight = segments area
 *  ╰────────╯        bottomRadius = 10
 *
 * Total width = bodyWidth; total height = neck + shoulder + body + bottom curve
 */

const BODY_WIDTH = 64;
const NECK_WIDTH = 26;
const NECK_HEIGHT = 14;
const NECK_RADIUS = 4; // roundness at top lip of neck
const SHOULDER_HEIGHT = 26; // vertical span of the single smooth curve from neck to body
const BOTTOM_RADIUS = 8;
const BODY_HEIGHT = 128; // fixed body height (independent of segment sizing)
export const TUBE_SVG_HEIGHT =
  NECK_HEIGHT + SHOULDER_HEIGHT + BODY_HEIGHT + BOTTOM_RADIUS;
export const TUBE_SVG_WIDTH = BODY_WIDTH;

// Keep internal aliases for convenience
const TOTAL_HEIGHT = TUBE_SVG_HEIGHT;
const TOTAL_WIDTH = TUBE_SVG_WIDTH;

// Liquid segments span from near the bottom up into the shoulder.
// SEGMENT_HEIGHT is sized so 4 segments cover body + most of shoulder.
const SEGMENT_HEIGHT = (BODY_HEIGHT + SHOULDER_HEIGHT - 4) / TUBE_CAPACITY;
// Bottom of first segment sits near the bottle floor
const LIQUID_BOTTOM = NECK_HEIGHT + SHOULDER_HEIGHT + BODY_HEIGHT + 5;

// SVG path for the bottle outline
const WALL_THICKNESS = 2;
const neckLeft = (TOTAL_WIDTH - NECK_WIDTH) / 2;
const neckRight = (TOTAL_WIDTH + NECK_WIDTH) / 2;

// Outer bottle path — cubic bezier shoulders for a smooth rounded flare
function bottlePath(): string {
  const r = BOTTOM_RADIUS;
  const nr = NECK_RADIUS;
  const bodyTop = NECK_HEIGHT + SHOULDER_HEIGHT;
  return [
    // Top-left of neck lip
    `M ${neckLeft + nr} 0`,
    // Top edge
    `L ${neckRight - nr} 0`,
    // Rounded top-right lip
    `Q ${neckRight} 0 ${neckRight} ${nr}`,
    // Right neck wall down to shoulder start
    `L ${neckRight} ${NECK_HEIGHT}`,
    // Rounded shoulder flare: neck → body (right side)
    // Cubic bezier: first control keeps vertical from neck, second keeps horizontal into body
    `C ${neckRight} ${NECK_HEIGHT + SHOULDER_HEIGHT * 0.65} ${TOTAL_WIDTH} ${bodyTop - SHOULDER_HEIGHT * 0.35} ${TOTAL_WIDTH} ${bodyTop}`,
    // Body right side down
    `L ${TOTAL_WIDTH} ${TOTAL_HEIGHT - r}`,
    // Bottom-right curve
    `Q ${TOTAL_WIDTH} ${TOTAL_HEIGHT} ${TOTAL_WIDTH - r} ${TOTAL_HEIGHT}`,
    // Bottom edge
    `L ${r} ${TOTAL_HEIGHT}`,
    // Bottom-left curve
    `Q 0 ${TOTAL_HEIGHT} 0 ${TOTAL_HEIGHT - r}`,
    // Body left side up
    `L 0 ${bodyTop}`,
    // Rounded shoulder flare: body → neck (left side)
    `C 0 ${bodyTop - SHOULDER_HEIGHT * 0.35} ${neckLeft} ${NECK_HEIGHT + SHOULDER_HEIGHT * 0.65} ${neckLeft} ${NECK_HEIGHT}`,
    // Left neck wall up
    `L ${neckLeft} ${nr}`,
    // Rounded top-left lip
    `Q ${neckLeft} 0 ${neckLeft + nr} 0`,
    `Z`,
  ].join(" ");
}

// Clip path for the liquid interior (inset by wall thickness)
// Stops at the shoulder curve — liquid never enters the neck
function liquidClipPath(): string {
  const w = WALL_THICKNESS;
  const r = Math.max(BOTTOM_RADIUS - w, 2);
  const inL = neckLeft + w;
  const inR = neckRight - w;
  const bodyTop = NECK_HEIGHT + SHOULDER_HEIGHT;
  return [
    // Start at top-right of shoulder (where neck meets body, right side)
    `M ${TOTAL_WIDTH - w} ${bodyTop}`,
    // Right side down
    `L ${TOTAL_WIDTH - w} ${TOTAL_HEIGHT - r - w}`,
    // Bottom-right curve
    `Q ${TOTAL_WIDTH - w} ${TOTAL_HEIGHT - w} ${TOTAL_WIDTH - r - w} ${TOTAL_HEIGHT - w}`,
    // Bottom edge
    `L ${r + w} ${TOTAL_HEIGHT - w}`,
    // Bottom-left curve
    `Q ${w} ${TOTAL_HEIGHT - w} ${w} ${TOTAL_HEIGHT - r - w}`,
    // Left side up
    `L ${w} ${bodyTop}`,
    // Shoulder curve left side: body → neck (rounded)
    `C ${w} ${bodyTop - SHOULDER_HEIGHT * 0.35} ${inL} ${NECK_HEIGHT + SHOULDER_HEIGHT * 0.65} ${inL} ${NECK_HEIGHT}`,
    // Across the neck opening
    `L ${inR} ${NECK_HEIGHT}`,
    // Shoulder curve right side: neck → body (rounded)
    `C ${inR} ${NECK_HEIGHT + SHOULDER_HEIGHT * 0.65} ${TOTAL_WIDTH - w} ${bodyTop - SHOULDER_HEIGHT * 0.35} ${TOTAL_WIDTH - w} ${bodyTop}`,
    `Z`,
  ].join(" ");
}

// Generate a wavy-top segment path. `phase` flips the wave direction.
const WAVE_AMP = 5;
function wavySegmentPath(top: number, bottom: number, amp: number): string {
  const w = TOTAL_WIDTH;
  const third = w / 3;
  return [
    `M 0 ${bottom + 1}`,
    `L ${w} ${bottom + 1}`,
    `L ${w} ${top}`,
    // Two cubic bezier humps across the top edge (right → left)
    `C ${w - third * 0.5} ${top - amp}, ${w - third * 1.5} ${top + amp}, ${w - third * 2} ${top}`,
    `C ${third * 1.5} ${top - amp}, ${third * 0.5} ${top + amp}, 0 ${top}`,
    `Z`,
  ].join(" ");
}

/**
 * Static SVG rendering of a bottle with liquid — reusable by animation overlay.
 * When `drainCount` > 0, the top N segments animate shrinking to simulate draining.
 */
const LOCKED_COLOR = "#4a5568";

export function TubeSVG({ tube, clipId, borderColor, drainCount = 0, lockedMask }: {
  tube: TubeType;
  clipId: string;
  borderColor?: string;
  /** Number of top segments currently draining (animate height → 0) */
  drainCount?: number;
  /** Per-segment locked mask (true = hidden color) */
  lockedMask?: boolean[];
}) {
  const border = borderColor ?? "rgba(148, 163, 184, 0.35)";
  return (
    <svg
      width={TOTAL_WIDTH}
      height={TOTAL_HEIGHT}
      viewBox={`0 0 ${TOTAL_WIDTH} ${TOTAL_HEIGHT}`}
      style={{ position: "absolute", top: 0, left: 0 }}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={liquidClipPath()} />
        </clipPath>

        {/* Glass highlight gradient — left-side light streak */}
        <linearGradient id={`${clipId}-hl`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="30%" stopColor="rgba(255,255,255,0.04)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>

        {/* Subtle right-side shadow */}
        <linearGradient id={`${clipId}-sh`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="70%" stopColor="rgba(0,0,0,0.02)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.1)" />
        </linearGradient>

        {/* Vertical light glint on left side of body */}
        <linearGradient id={`${clipId}-gl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="20%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="80%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* Glass body fill */}
      <path d={bottlePath()} fill="rgba(148, 163, 184, 0.10)" />

      {/* Liquid segments — clipped to interior */}
      <g clipPath={`url(#${clipId})`}>
        {tube.map((color, i) => {
          const isLocked = lockedMask?.[i] ?? false;
          const baseColor = isLocked ? LOCKED_COLOR : (COLORS[color] ?? color);
          const segBottom = LIQUID_BOTTOM - i * SEGMENT_HEIGHT;
          const segTop = segBottom - SEGMENT_HEIGHT;
          // Should this segment drain? Top `drainCount` segments animate out
          const isDraining = drainCount > 0 && i >= tube.length - drainCount;
          const drainDelay = isDraining
            ? (tube.length - 1 - i) * 0.04
            : 0;
          const segCenterX = TOTAL_WIDTH / 2;
          const segCenterY = (segTop + segBottom) / 2;

          return (
            <g key={i}>
              {isDraining ? (
                <motion.rect
                  x={0}
                  width={TOTAL_WIDTH}
                  fill={baseColor}
                  initial={{ y: segTop, height: SEGMENT_HEIGHT + 1 }}
                  animate={{ y: segBottom, height: 0 }}
                  transition={{
                    duration: 0.18,
                    ease: [0.22, 1, 0.36, 1],
                    delay: drainDelay,
                  }}
                />
              ) : (
                <rect
                  x={0}
                  y={segTop}
                  width={TOTAL_WIDTH}
                  height={SEGMENT_HEIGHT + 1}
                  fill={baseColor}
                />
              )}
              <rect
                x={WALL_THICKNESS}
                y={segTop}
                width={TOTAL_WIDTH - WALL_THICKNESS * 2}
                height={SEGMENT_HEIGHT + 1}
                fill={`url(#${clipId}-hl)`}
              />
              {isLocked && !isDraining && (
                <text
                  x={segCenterX}
                  y={segCenterY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="rgba(255,255,255,0.6)"
                  fontSize={18}
                  fontWeight={700}
                  style={{ pointerEvents: "none" }}
                >
                  ?
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* Glass highlight overlay — full bottle */}
      <path d={bottlePath()} fill={`url(#${clipId}-hl)`} />
      <path d={bottlePath()} fill={`url(#${clipId}-sh)`} />

      {/* Left glint stripe */}
      <rect
        x={4}
        y={NECK_HEIGHT + SHOULDER_HEIGHT}
        width={3}
        height={BODY_HEIGHT - 8}
        rx={1.5}
        fill={`url(#${clipId}-gl)`}
      />

      {/* Small specular dot near top-left of body */}
      <circle
        cx={10}
        cy={NECK_HEIGHT + SHOULDER_HEIGHT}
        r={3}
        fill="rgba(255,255,255,0.2)"
      />

      {/* Bottle outline */}
      <path
        d={bottlePath()}
        fill="none"
        stroke={border}
        strokeWidth={WALL_THICKNESS}
      />
    </svg>
  );
}

interface TubeProps {
  tube: TubeType;
  selected: boolean;
  invalid: boolean;
  onClick: () => void;
  /** Per-segment locked mask (true = hidden color) */
  lockedMask?: boolean[];
}

export function Tube({ tube, selected, invalid, onClick, lockedMask }: TubeProps) {
  const complete = isTubeComplete(tube);
  const clipId = `bottle-clip-${Math.random().toString(36).slice(2, 9)}`;

  // Track segment count to detect newly poured segments.
  // useEffect defers the ref update to after commit, so it works with StrictMode.
  const prevCountRef = useRef(tube.length);
  const genRef = useRef(0);
  const newStartIndex = prevCountRef.current;
  const isGrowing = tube.length > prevCountRef.current;
  if (isGrowing) {
    genRef.current++;
  }
  const gen = genRef.current;
  useEffect(() => {
    prevCountRef.current = tube.length;
  });

  const borderColor = complete
    ? "rgba(34, 197, 94, 0.6)"
    : "rgba(148, 163, 184, 0.35)";

  return (
    <motion.div
      onClick={onClick}
      animate={{
        y: selected ? -20 : 0,
        scale: selected ? 1.05 : 1,
        x: invalid ? [0, -6, 6, -4, 4, -2, 2, 0] : 0,
      }}
      transition={
        invalid
          ? { x: { duration: 0.4, ease: "easeInOut" } }
          : { type: "spring", stiffness: 350, damping: 28, mass: 0.8 }
      }
      style={{
        width: TOTAL_WIDTH,
        height: TOTAL_HEIGHT,
        position: "relative",
        cursor: complete ? "default" : "pointer",
        filter: complete
          ? "drop-shadow(0 0 12px rgba(34, 197, 94, 0.3))"
          : selected
            ? "drop-shadow(0 0 10px rgba(59, 130, 246, 0.4))"
            : "none",
      }}
    >
      <svg
        width={TOTAL_WIDTH}
        height={TOTAL_HEIGHT}
        viewBox={`0 0 ${TOTAL_WIDTH} ${TOTAL_HEIGHT}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={liquidClipPath()} />
          </clipPath>

          {/* Glass highlight gradient — left-side light streak */}
          <linearGradient id="glassHighlight" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="30%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Subtle right-side shadow */}
          <linearGradient id="glassShadow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="70%" stopColor="rgba(0,0,0,0.02)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.1)" />
          </linearGradient>

          {/* Vertical light glint on left side of body */}
          <linearGradient id="glintGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="20%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="80%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* Glass body fill */}
        <path d={bottlePath()} fill="rgba(148, 163, 184, 0.10)" />

        {/* Liquid segments — clipped to interior */}
        <g clipPath={`url(#${clipId})`}>
          {tube.map((color, i) => {
            const isLocked = lockedMask?.[i] ?? false;
            const baseColor = isLocked ? LOCKED_COLOR : (COLORS[color] ?? color);
            const segBottom = LIQUID_BOTTOM - i * SEGMENT_HEIGHT;
            const segTop = segBottom - SEGMENT_HEIGHT;
            const isTop = i === tube.length - 1;
            const isNew = i >= newStartIndex;
            const delay = isNew ? (i - newStartIndex) * 0.12 : 0;
            const segCenterX = TOTAL_WIDTH / 2;
            const segCenterY = (segTop + segBottom) / 2;

            // Use gen in key for new segments so they remount and play initial
            const segKey = isNew ? `${i}-${gen}` : i;

            return (
              <g key={segKey}>
                {isTop && selected ? (
                  /* Top segment with wave animation */
                  <motion.path
                    initial={{ d: wavySegmentPath(segTop, segBottom, 0) }}
                    animate={{
                      d: [
                        wavySegmentPath(segTop, segBottom, WAVE_AMP),
                        wavySegmentPath(segTop, segBottom, -WAVE_AMP),
                      ],
                    }}
                    transition={{
                      d: {
                        repeat: Infinity,
                        repeatType: "reverse",
                        duration: 0.8,
                        ease: "easeInOut",
                      },
                    }}
                    fill={baseColor}
                  />
                ) : isNew ? (
                  /* Newly poured segment: expand from bottom upward */
                  <motion.rect
                    x={0}
                    width={TOTAL_WIDTH}
                    fill={baseColor}
                    initial={{ y: segBottom, height: 0 }}
                    animate={{ y: segTop, height: SEGMENT_HEIGHT + 1 }}
                    transition={{
                      duration: 0.4,
                      ease: [0.22, 1, 0.36, 1],
                      delay,
                    }}
                  />
                ) : (
                  /* Existing segment: static */
                  <rect
                    x={0}
                    y={segTop}
                    width={TOTAL_WIDTH}
                    height={SEGMENT_HEIGHT + 1}
                    fill={baseColor}
                  />
                )}
                <rect
                  x={WALL_THICKNESS}
                  y={segTop}
                  width={TOTAL_WIDTH - WALL_THICKNESS * 2}
                  height={SEGMENT_HEIGHT + 1}
                  fill="url(#glassHighlight)"
                />
                {isLocked && (
                  <text
                    x={segCenterX}
                    y={segCenterY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="rgba(255,255,255,0.6)"
                    fontSize={18}
                    fontWeight={700}
                    style={{ pointerEvents: "none" }}
                  >
                    ?
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Glass highlight overlay — full bottle */}
        <path d={bottlePath()} fill="url(#glassHighlight)" />
        <path d={bottlePath()} fill="url(#glassShadow)" />

        {/* Left glint stripe */}
        <rect
          x={4}
          y={NECK_HEIGHT + SHOULDER_HEIGHT}
          width={3}
          height={BODY_HEIGHT - 8}
          rx={1.5}
          fill="url(#glintGrad)"
        />

        {/* Small specular dot near top-left of body */}
        <circle
          cx={10}
          cy={NECK_HEIGHT + SHOULDER_HEIGHT}
          r={3}
          fill="rgba(255,255,255,0.2)"
        />

        {/* Bottle outline */}
        <path
          d={bottlePath()}
          fill="none"
          stroke={borderColor}
          strokeWidth={WALL_THICKNESS}
        />
      </svg>
    </motion.div>
  );
}
