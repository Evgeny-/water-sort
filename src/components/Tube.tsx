import { useRef, useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { type Tube as TubeType, TUBE_CAPACITY, COLORS } from "../game/types";
import { isTubeComplete } from "../game/engine";
import { audioManager } from "../audio/audioManager";

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
export const SEGMENT_HEIGHT =
  (BODY_HEIGHT + SHOULDER_HEIGHT - 4) / TUBE_CAPACITY;
// Bottom of first segment sits near the bottle floor
export const LIQUID_BOTTOM = NECK_HEIGHT + SHOULDER_HEIGHT + BODY_HEIGHT + 5;

// SVG path for the bottle outline
const WALL_THICKNESS = 2;
const neckLeft = (TOTAL_WIDTH - NECK_WIDTH) / 2;
const neckRight = (TOTAL_WIDTH + NECK_WIDTH) / 2;

// Pre-computed SVG paths (all values are module-level constants, no need to recompute)
const BOTTLE_PATH = (() => {
  const r = BOTTOM_RADIUS;
  const nr = NECK_RADIUS;
  const bodyTop = NECK_HEIGHT + SHOULDER_HEIGHT;
  return [
    `M ${neckLeft + nr} 0`,
    `L ${neckRight - nr} 0`,
    `Q ${neckRight} 0 ${neckRight} ${nr}`,
    `L ${neckRight} ${NECK_HEIGHT}`,
    `C ${neckRight} ${NECK_HEIGHT + SHOULDER_HEIGHT * 0.65} ${TOTAL_WIDTH} ${bodyTop - SHOULDER_HEIGHT * 0.35} ${TOTAL_WIDTH} ${bodyTop}`,
    `L ${TOTAL_WIDTH} ${TOTAL_HEIGHT - r}`,
    `Q ${TOTAL_WIDTH} ${TOTAL_HEIGHT} ${TOTAL_WIDTH - r} ${TOTAL_HEIGHT}`,
    `L ${r} ${TOTAL_HEIGHT}`,
    `Q 0 ${TOTAL_HEIGHT} 0 ${TOTAL_HEIGHT - r}`,
    `L 0 ${bodyTop}`,
    `C 0 ${bodyTop - SHOULDER_HEIGHT * 0.35} ${neckLeft} ${NECK_HEIGHT + SHOULDER_HEIGHT * 0.65} ${neckLeft} ${NECK_HEIGHT}`,
    `L ${neckLeft} ${nr}`,
    `Q ${neckLeft} 0 ${neckLeft + nr} 0`,
    `Z`,
  ].join(" ");
})();

const LIQUID_CLIP_PATH = (() => {
  const w = WALL_THICKNESS;
  const r = Math.max(BOTTOM_RADIUS - w, 2);
  const inL = neckLeft + w;
  const inR = neckRight - w;
  const bodyTop = NECK_HEIGHT + SHOULDER_HEIGHT;
  return [
    `M ${TOTAL_WIDTH - w} ${bodyTop}`,
    `L ${TOTAL_WIDTH - w} ${TOTAL_HEIGHT - r - w}`,
    `Q ${TOTAL_WIDTH - w} ${TOTAL_HEIGHT - w} ${TOTAL_WIDTH - r - w} ${TOTAL_HEIGHT - w}`,
    `L ${r + w} ${TOTAL_HEIGHT - w}`,
    `Q ${w} ${TOTAL_HEIGHT - w} ${w} ${TOTAL_HEIGHT - r - w}`,
    `L ${w} ${bodyTop}`,
    `C ${w} ${bodyTop - SHOULDER_HEIGHT * 0.35} ${inL} ${NECK_HEIGHT + SHOULDER_HEIGHT * 0.65} ${inL} ${NECK_HEIGHT}`,
    `L ${inR} ${NECK_HEIGHT}`,
    `C ${inR} ${NECK_HEIGHT + SHOULDER_HEIGHT * 0.65} ${TOTAL_WIDTH - w} ${bodyTop - SHOULDER_HEIGHT * 0.35} ${TOTAL_WIDTH - w} ${bodyTop}`,
    `Z`,
  ].join(" ");
})();

// Generate a wavy-top segment path using a smooth sine-like curve.
// The wave is built from 4 cubic bezier segments that approximate a full sine wave
// across the bottle width, with continuous tangent at every join point.
const WAVE_AMP_IDLE = 1;
const WAVE_AMP = 3;
function wavySegmentPath(top: number, bottom: number, amp: number): string {
  const w = TOTAL_WIDTH;
  // 4 quarter-wave segments, each spanning w/4 horizontally
  const qw = w / 4;
  // Bezier control handle length for sine approximation: (4/3)*tan(π/8) ≈ 0.5523
  const k = qw * 0.5523;
  // Key x positions: 0, qw, 2qw, 3qw, w
  // Key y positions: top (neutral), top-amp (peak), top (neutral), top+amp (trough), top (neutral)
  return [
    `M 0 ${bottom + 1}`,
    `L ${w} ${bottom + 1}`,
    `L ${w} ${top}`,
    // Right → left: 4 quarter-wave cubic segments with smooth joins
    // Segment 1: w,top → 3qw,top-amp (rising to peak)
    `C ${w - k} ${top}, ${3 * qw + k} ${top - amp}, ${3 * qw} ${top - amp}`,
    // Segment 2: 3qw,top-amp → 2qw,top (peak to neutral)
    `C ${3 * qw - k} ${top - amp}, ${2 * qw + k} ${top}, ${2 * qw} ${top}`,
    // Segment 3: 2qw,top → qw,top+amp (neutral to trough)
    `C ${2 * qw - k} ${top}, ${qw + k} ${top + amp}, ${qw} ${top + amp}`,
    // Segment 4: qw,top+amp → 0,top (trough to neutral)
    `C ${qw - k} ${top + amp}, ${k} ${top}, 0 ${top}`,
    `Z`,
  ].join(" ");
}

/**
 * Shared SVG gradient defs — render once in the parent container.
 * Individual Tube SVGs reference these by ID.
 */
export function TubeSharedDefs() {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="glassHighlight" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="30%" stopColor="rgba(255,255,255,0.04)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id="glassShadow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="70%" stopColor="rgba(0,0,0,0.02)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.1)" />
        </linearGradient>
        <linearGradient id="glintGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="20%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="80%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Continuously animated wavy segment using rAF.
 *  `targetAmp` is smoothly lerped so amplitude changes feel natural.
 *  `speed` controls oscillation rate (rad/s). `phase` offsets the start. */
function WavySegment({
  top,
  bottom,
  targetAmp,
  speed,
  phase,
  fill,
}: {
  top: number;
  bottom: number;
  targetAmp: number;
  speed: number;
  phase: number;
  fill: string;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const ampRef = useRef(targetAmp);
  const targetRef = useRef(targetAmp);
  targetRef.current = targetAmp;

  const animate = useCallback(
    (time: number) => {
      // Smoothly lerp current amplitude toward target
      const lerpSpeed = 0.07; // per frame, ~4-5 frames to settle
      ampRef.current += (targetRef.current - ampRef.current) * lerpSpeed;

      const t = time / 1000;
      const sine = Math.sin(t * speed + phase);
      const currentAmp = ampRef.current * sine;

      if (pathRef.current) {
        pathRef.current.setAttribute(
          "d",
          wavySegmentPath(top, bottom, currentAmp),
        );
      }
      rafRef.current = requestAnimationFrame(animate);
    },
    [top, bottom, speed, phase],
  );

  const rafRef = useRef(0);
  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  return <path ref={pathRef} d={wavySegmentPath(top, bottom, 0)} fill={fill} />;
}

/**
 * Static SVG rendering of a bottle with liquid — reusable by animation overlay.
 * When `drainCount` > 0, the top N segments animate shrinking to simulate draining.
 */
const LOCKED_COLOR = "#4a5568";

export function TubeSVG({
  tube,
  clipId,
  borderColor,
  drainCount = 0,
  lockedMask,
}: {
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
          <path d={LIQUID_CLIP_PATH} />
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
      <path d={BOTTLE_PATH} fill="rgba(148, 163, 184, 0.10)" />

      {/* Liquid segments — clipped to interior */}
      <g clipPath={`url(#${clipId})`}>
        {tube.map((color, i) => {
          const isLocked = lockedMask?.[i] ?? false;
          const baseColor = isLocked ? LOCKED_COLOR : (COLORS[color] ?? color);
          const segBottom = LIQUID_BOTTOM - i * SEGMENT_HEIGHT;
          const segTop = segBottom - SEGMENT_HEIGHT;
          // Should this segment drain? Top `drainCount` segments animate out
          const isDraining = drainCount > 0 && i >= tube.length - drainCount;
          const drainDelay = isDraining ? (tube.length - 1 - i) * 0.04 : 0;
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
      <path d={BOTTLE_PATH} fill={`url(#${clipId}-hl)`} />
      <path d={BOTTLE_PATH} fill={`url(#${clipId}-sh)`} />

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
        d={BOTTLE_PATH}
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
  /** True while this tube is hidden behind the pour animation overlay */
  hidden?: boolean;
  /** Disable idle wave animation for performance (active waves on select/fill still work) */
  disableIdleWave?: boolean;
  /** Skip glass detail overlays for performance with many bottles */
  simplified?: boolean;
}

export function Tube({
  tube,
  selected,
  invalid,
  onClick,
  lockedMask,
  hidden,
  disableIdleWave,
  simplified,
}: TubeProps) {
  const complete = isTubeComplete(tube, lockedMask);
  // Stable unique ID so SVG defs don't remount every render
  const clipId = useRef(`bottle-clip-${Math.random().toString(36).slice(2, 9)}`).current;
  // Random phase offset so each bottle's idle wave is out of sync
  const wavePhase = useRef(Math.random() * Math.PI * 2).current;

  // Play chime when tube becomes complete
  const prevCompleteRef = useRef(complete);
  useEffect(() => {
    if (complete && !prevCompleteRef.current) {
      audioManager.playTubeComplete();
    }
    prevCompleteRef.current = complete;
  }, [complete]);

  // Track which segments just got revealed (locked → unlocked).
  // When the tube is hidden (behind pour overlay), we accumulate pending
  // reveals and only start the animation once the tube becomes visible.
  const prevLockedRef = useRef(lockedMask);
  const [revealedSet, setRevealedSet] = useState<Set<number>>(new Set());
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRevealRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    // Detect newly revealed segments by comparing previous and current lockedMask
    const prev = prevLockedRef.current;
    prevLockedRef.current = lockedMask;

    if (!prev || !lockedMask) return;
    const revealed = new Set<number>();
    for (let i = 0; i < tube.length; i++) {
      if (prev[i] && !lockedMask[i]) {
        revealed.add(i);
      }
    }
    if (revealed.size === 0) return;

    if (hidden) {
      // Tube is invisible — stash reveals for when it becomes visible
      pendingRevealRef.current = revealed;
    } else {
      setRevealedSet(revealed);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = setTimeout(() => setRevealedSet(new Set()), 500);
    }
  }, [lockedMask, tube.length, hidden]);

  // When tube transitions from hidden → visible, flush pending reveals
  useEffect(() => {
    if (!hidden && pendingRevealRef.current) {
      const pending = pendingRevealRef.current;
      pendingRevealRef.current = null;
      setRevealedSet(pending);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = setTimeout(() => setRevealedSet(new Set()), 500);
    }
  }, [hidden]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

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

  // fillWave is true during fill + settling period; WavySegment handles smooth decay
  const [fillWave, setFillWave] = useState(false);
  const fillWaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isGrowing) {
      if (fillWaveTimer.current) clearTimeout(fillWaveTimer.current);
      setFillWave(true);
      const newCount = tube.length - newStartIndex;
      const fillDoneMs = ((newCount - 1) * 0.12 + 0.4) * 1000;
      fillWaveTimer.current = setTimeout(
        () => setFillWave(false),
        fillDoneMs + 400,
      );
    }
    return () => {
      if (fillWaveTimer.current) clearTimeout(fillWaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen]);

  const borderColor = complete
    ? "rgba(34, 197, 94, 0.6)"
    : "rgba(148, 163, 184, 0.35)";

  // Clear invalid shake after animation completes
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (invalid) {
      setShaking(true);
      const timer = setTimeout(() => setShaking(false), 400);
      return () => clearTimeout(timer);
    }
  }, [invalid]);

  return (
    <div
      onClick={onClick}
      style={{
        width: TOTAL_WIDTH,
        height: TOTAL_HEIGHT,
        position: "relative",
        cursor: complete ? "default" : "pointer",
        transform: selected
          ? "translateY(-20px) scale(1.05)"
          : "translateY(0) scale(1)",
        transition: "transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
        filter: complete
          ? "drop-shadow(0 0 12px rgba(34, 197, 94, 0.3))"
          : selected
            ? "drop-shadow(0 0 10px rgba(59, 130, 246, 0.4))"
            : undefined,
        animation: shaking ? "tube-shake 0.4s ease-in-out" : undefined,
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
            <path d={LIQUID_CLIP_PATH} />
          </clipPath>
        </defs>

        {/* Glass body fill */}
        <path d={BOTTLE_PATH} fill="rgba(148, 163, 184, 0.10)" />

        {/* Liquid segments — clipped to interior */}
        <g clipPath={`url(#${clipId})`}>
          {tube.map((color, i) => {
            const isLocked = lockedMask?.[i] ?? false;
            const isRevealing = revealedSet.has(i);
            const realColor = COLORS[color] ?? color;
            const baseColor = isLocked ? LOCKED_COLOR : realColor;
            const segBottom = LIQUID_BOTTOM - i * SEGMENT_HEIGHT;
            const segTop = segBottom - SEGMENT_HEIGHT;
            const isTop = i === tube.length - 1;
            const isNew = i >= newStartIndex;
            const delay = isNew ? (i - newStartIndex) * 0.12 : 0;
            const segCenterX = TOTAL_WIDTH / 2;
            const segCenterY = (segTop + segBottom) / 2;

            // Use gen in key for new segments so they remount and play initial
            const segKey = isNew ? `${i}-${gen}` : i;

            // Wave amplitude target for the top segment:
            // selected → full, filling → full, idle → subtle (or 0 if disabled)
            const isActive = selected || fillWave;
            const amp = isTop
              ? isActive
                ? WAVE_AMP
                : disableIdleWave
                  ? 0
                  : WAVE_AMP_IDLE
              : 0;
            const waveSpeed = isActive ? 5 : 3;
            // Skip WavySegment entirely when idle wave is disabled and not active
            const useStaticTop = isTop && !isActive && disableIdleWave;

            return (
              <g key={segKey}>
                {isRevealing && simplified ? (
                  /* Simplified reveal: instant color change, no animation */
                  <rect
                    x={0}
                    y={segTop}
                    width={TOTAL_WIDTH}
                    height={SEGMENT_HEIGHT + 1}
                    fill={realColor}
                  />
                ) : isRevealing ? (
                  /* Segment being revealed: animate color from locked gray to real color */
                  <motion.rect
                    x={0}
                    y={segTop}
                    width={TOTAL_WIDTH}
                    height={SEGMENT_HEIGHT + 1}
                    initial={{ fill: LOCKED_COLOR }}
                    animate={{ fill: realColor }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                ) : isTop && isNew && fillWave ? (
                  /* New top segment: expand from bottom with wave */
                  <>
                    <defs>
                      <clipPath id={`${clipId}-fill-${gen}`}>
                        <motion.rect
                          x={0}
                          width={TOTAL_WIDTH}
                          initial={{ y: segBottom, height: 0 }}
                          animate={{
                            y: segTop - WAVE_AMP,
                            height: SEGMENT_HEIGHT + 1 + WAVE_AMP,
                          }}
                          transition={{
                            duration: 0.4,
                            ease: [0.22, 1, 0.36, 1],
                            delay,
                          }}
                        />
                      </clipPath>
                    </defs>
                    <g clipPath={`url(#${clipId}-fill-${gen})`}>
                      <WavySegment
                        top={segTop}
                        bottom={segBottom}
                        targetAmp={amp}
                        speed={waveSpeed}
                        phase={wavePhase}
                        fill={baseColor}
                      />
                    </g>
                  </>
                ) : useStaticTop ? (
                  /* Top segment static (idle wave disabled for performance) */
                  <rect
                    x={0}
                    y={segTop}
                    width={TOTAL_WIDTH}
                    height={SEGMENT_HEIGHT + 1}
                    fill={baseColor}
                  />
                ) : isTop ? (
                  /* Top segment with continuous wave (amplitude smoothly adjusts) */
                  <WavySegment
                    top={segTop}
                    bottom={segBottom}
                    targetAmp={amp}
                    speed={waveSpeed}
                    phase={wavePhase}
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
                {isLocked && (
                  simplified ? (
                    <text
                      x={segCenterX}
                      y={segCenterY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={18}
                      fontWeight={700}
                      style={{ pointerEvents: "none" }}
                      fill="rgba(255,255,255,0.6)"
                    >
                      ?
                    </text>
                  ) : (
                    <motion.text
                      x={segCenterX}
                      y={segCenterY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={18}
                      fontWeight={700}
                      style={{ pointerEvents: "none" }}
                      initial={{ opacity: 0.6, scale: 1 }}
                      animate={{ opacity: 0.6, scale: 1 }}
                      fill="rgba(255,255,255,0.6)"
                    >
                      ?
                    </motion.text>
                  )
                )}
                {isRevealing && !simplified && (
                  <motion.text
                    x={segCenterX}
                    y={segCenterY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={18}
                    fontWeight={700}
                    style={{ pointerEvents: "none" }}
                    initial={{ opacity: 0.6, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.5 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    fill="rgba(255,255,255,0.6)"
                  >
                    ?
                  </motion.text>
                )}
              </g>
            );
          })}
        </g>

        {/* Glass highlight and shadow overlays — always shown for volume */}
        <path d={BOTTLE_PATH} fill="url(#glassHighlight)" />
        <path d={BOTTLE_PATH} fill="url(#glassShadow)" />

        {/* Extra glass details — skip when simplified for performance */}
        {!simplified && (
          <>
            <rect
              x={4}
              y={NECK_HEIGHT + SHOULDER_HEIGHT}
              width={3}
              height={BODY_HEIGHT - 8}
              rx={1.5}
              fill="url(#glintGrad)"
            />
            <circle
              cx={10}
              cy={NECK_HEIGHT + SHOULDER_HEIGHT}
              r={3}
              fill="rgba(255,255,255,0.2)"
            />
          </>
        )}

        {/* Bottle outline */}
        <path
          d={BOTTLE_PATH}
          fill="none"
          stroke={borderColor}
          strokeWidth={WALL_THICKNESS}
        />

        {/* Checkmark for completed tubes */}
        {complete && (
          <path
            d={`M ${TOTAL_WIDTH / 2 - 7} ${TOTAL_HEIGHT / 2 + 10} l 5 5 l 9 -9`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.7)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
}
