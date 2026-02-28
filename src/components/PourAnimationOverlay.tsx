import { useEffect, useRef, useState, type RefObject } from "react";
import { motion, useAnimate } from "framer-motion";
import type { PourAnimation } from "../game/types";
import { COLORS } from "../game/types";
import { TubeSVG, TUBE_SVG_WIDTH, TUBE_SVG_HEIGHT, SEGMENT_HEIGHT, LIQUID_BOTTOM } from "./Tube";


interface StreamPos {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type StreamPhase = "pouring" | "ending";

interface PourAnimationOverlayProps {
  anim: PourAnimation;
  gridRef: RefObject<HTMLDivElement | null>;
  tubeRefs: RefObject<(HTMLDivElement | null)[]>;
  onPour: () => void;
  onFinished: () => void;
}

export function PourAnimationOverlay({
  anim,
  gridRef,
  tubeRefs,
  onPour,
  onFinished,
}: PourAnimationOverlayProps) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [draining, setDraining] = useState(false);
  const [streamPos, setStreamPos] = useState<StreamPos | null>(null);
  const [streamPhase, setStreamPhase] = useState<StreamPhase>("pouring");
  const committedRef = useRef(false);

  // Duration the stream is visible — scales with number of segments poured
  const pourDuration = 100 + anim.count * 100;

  useEffect(() => {
    const gridEl = gridRef.current;
    const fromEl = tubeRefs.current[anim.fromIndex];
    const toEl = tubeRefs.current[anim.toIndex];
    if (!gridEl || !fromEl || !toEl) return;

    const gridRect = gridEl.getBoundingClientRect();
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const scale = gridRect.width > 0 ? gridEl.offsetWidth / gridRect.width : 1;

    const fromX = (fromRect.left - gridRect.left) * scale;
    const fromY = (fromRect.top - gridRect.top) * scale;
    const toX = (toRect.left - gridRect.left) * scale;
    const toY = (toRect.top - gridRect.top) * scale;

    scope.current.style.left = `${fromX}px`;
    scope.current.style.top = `${fromY}px`;

    const pourRight = toX >= fromX;
    const tiltDeg = pourRight ? 60 : -60;

    const rad = (tiltDeg * Math.PI) / 180;
    const dx = toX - fromX - TUBE_SVG_HEIGHT * Math.sin(rad);
    const dy = toY - fromY - TUBE_SVG_HEIGHT + TUBE_SVG_HEIGHT * Math.cos(rad);

    // Compute stream positions in grid coords.
    //
    // The dx/dy was designed so the source bottle's neck center (W/2, 0)
    // lands at (toX + W/2, toY) after translation + rotation. So in grid
    // coords, the neck center is at (toX + W/2, toY).
    //
    // The pour lip is the lower edge of the tilted neck — water flows out
    // from the side of the neck that faces the destination. In the bottle's
    // local frame, the lip is at (neckRight, 0) for a right pour or
    // (neckLeft, 0) for a left pour. Relative to the neck center (W/2, 0),
    // the lip offset is (+NECK_WIDTH/2, 0) or (-NECK_WIDTH/2, 0).
    // After rotation by tiltDeg around the neck center, this offset rotates:
    const NECK_WIDTH = 26;
    const lipLocalX = pourRight ? NECK_WIDTH / 2 : -NECK_WIDTH / 2;
    const lipLocalY = 0;
    const lipRotX = lipLocalX * Math.cos(rad) - lipLocalY * Math.sin(rad);
    const lipRotY = lipLocalX * Math.sin(rad) + lipLocalY * Math.cos(rad);
    const neckCenterX = toX + TUBE_SVG_WIDTH / 2;
    const neckCenterY = toY;
    const neckX = neckCenterX + lipRotX;
    const neckY = neckCenterY + lipRotY;

    // Stream destination: at the current water surface of the destination bottle.
    // If empty, stream goes to the bottom of the bottle.
    const destNeckX = toX + TUBE_SVG_WIDTH / 2;
    const destNeckY = anim.destTubeLength > 0
      ? toY + LIQUID_BOTTOM - anim.destTubeLength * SEGMENT_HEIGHT
      : toY + LIQUID_BOTTOM - SEGMENT_HEIGHT * 0.5;

    const selectedY = -20;
    const selectedScale = 1.05;
    animate(
      scope.current,
      { y: selectedY, scale: selectedScale },
      { duration: 0 },
    );

    const run = async () => {
      // Phase 1: Move and tilt — start the stream partway through
      const tiltDuration = 0.2;
      const streamStartDelay = tiltDuration * 0.45 * 1000; // start stream at ~45% of tilt

      const tiltPromise = animate(
        scope.current,
        { x: dx, y: dy, rotate: tiltDeg, scale: 1 },
        { duration: tiltDuration, ease: [0.22, 1, 0.36, 1] },
      );

      // Start the stream before the tilt finishes
      await new Promise((r) => setTimeout(r, streamStartDelay));

      // Phase 2: Stream + drain + fill
      setStreamPhase("pouring");
      setStreamPos({ x1: neckX, y1: neckY, x2: destNeckX, y2: destNeckY });
      setDraining(true);
      if (!committedRef.current) {
        committedRef.current = true;
        onPour();
      }

      // Wait for tilt to finish (if it hasn't already)
      await tiltPromise;

      // Let the stream flow for a visible duration
      await new Promise((r) => setTimeout(r, pourDuration));

      // Phase 3: End the stream (animate it closing off)
      setStreamPhase("ending");
      await new Promise((r) => setTimeout(r, 120));
      setStreamPos(null);

      // Phase 4: Tilt back
      await animate(
        scope.current,
        { rotate: 0 },
        { duration: 0.1, ease: "easeOut" },
      );

      // Phase 5: Return to original position
      await animate(
        scope.current,
        { x: 0, y: 0, scale: 1 },
        { duration: 0.12, ease: "easeInOut" },
      );

      onFinished();
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        ref={scope}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: TUBE_SVG_WIDTH,
          height: TUBE_SVG_HEIGHT,
          zIndex: 10,
          transformOrigin: `${TUBE_SVG_WIDTH / 2}px ${TUBE_SVG_HEIGHT}px`,
          pointerEvents: "none",
        }}
      >
        <TubeSVG
          tube={anim.sourceTubeBefore}
          clipId="pour-anim-clip"
          drainCount={draining ? anim.count : 0}
          lockedMask={anim.sourceLockedBefore}
        />
      </div>

      {streamPos && (
        <WaterStream
          x1={streamPos.x1}
          y1={streamPos.y1}
          x2={streamPos.x2}
          y2={streamPos.y2}
          color={COLORS[anim.color] ?? anim.color}
          phase={streamPhase}
        />
      )}
    </>
  );
}

/** Animated water stream SVG rendered in grid coordinate space */
function WaterStream({
  x1,
  y1,
  x2,
  y2,
  color,
  phase,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  phase: StreamPhase;
}) {
  const pad = 25;
  const minX = Math.min(x1, x2) - pad;
  const minY = Math.min(y1, y2) - pad;
  const maxX = Math.max(x1, x2) + pad;
  const maxY = Math.max(y1, y2) + pad;
  const svgW = maxX - minX;
  const svgH = maxY - minY;

  // Local coords within SVG
  const lx1 = x1 - minX;
  const ly1 = y1 - minY;
  const lx2 = x2 - minX;
  const ly2 = y2 - minY;

  // Stream width — needs to be thick enough to be visible
  const streamWidth = 8;

  // Build the stream curve — water pours from the lip and arcs down with gravity.
  // Use control points that create a natural parabolic-like arc.
  // First control: drop vertically from source with slight horizontal drift
  const cp1x = lx1 + (lx2 - lx1) * 0.15;
  const cp1y = ly1 + (ly2 - ly1) * 0.65;
  // Second control: approach destination mostly vertically
  const cp2x = lx2;
  const cp2y = ly2 - (ly2 - ly1) * 0.2;

  const centerPath = `M ${lx1} ${ly1} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${lx2} ${ly2}`;

  // Compute normals to create tapered width along the path
  // At source: tangent is toward cp1
  const t1dx = cp1x - lx1;
  const t1dy = cp1y - ly1;
  const t1len = Math.sqrt(t1dx * t1dx + t1dy * t1dy) || 1;
  const n1x = -t1dy / t1len;
  const n1y = t1dx / t1len;

  // At destination: tangent from cp2 to end
  const t2dx = lx2 - cp2x;
  const t2dy = ly2 - cp2y;
  const t2len = Math.sqrt(t2dx * t2dx + t2dy * t2dy) || 1;
  const n2x = -t2dy / t2len;
  const n2y = t2dx / t2len;

  const hw1 = streamWidth / 2;
  const hw2 = (streamWidth - 1) / 2; // slightly narrower at bottom

  // Filled stream shape using cubic bezier outlines
  const streamPath = [
    `M ${lx1 + n1x * hw1} ${ly1 + n1y * hw1}`,
    `C ${cp1x + n1x * hw1} ${cp1y + n1y * hw1} ${cp2x + n2x * hw2} ${cp2y + n2y * hw2} ${lx2 + n2x * hw2} ${ly2 + n2y * hw2}`,
    `L ${lx2 - n2x * hw2} ${ly2 - n2y * hw2}`,
    `C ${cp2x - n2x * hw2} ${cp2y - n2y * hw2} ${cp1x - n1x * hw1} ${cp1y - n1y * hw1} ${lx1 - n1x * hw1} ${ly1 - n1y * hw1}`,
    `Z`,
  ].join(" ");

  const gradId = "stream-grad";
  const maskId = "stream-mask";

  return (
    <div
      style={{
        position: "absolute",
        left: minX,
        top: minY,
        width: svgW,
        height: svgH,
        zIndex: 11,
        pointerEvents: "none",
      }}
    >
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Gradient along the stream for depth */}
          <linearGradient
            id={gradId}
            x1={lx1}
            y1={ly1}
            x2={lx2}
            y2={ly2}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
            <stop offset="40%" stopColor={color} stopOpacity={0.85} />
            <stop offset="100%" stopColor={color} stopOpacity={0.75} />
          </linearGradient>

          {/* Highlight for liquid shine */}
          <linearGradient id={`${gradId}-hl`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Reveal mask — animated rect that grows downward to reveal the stream */}
          <mask id={maskId}>
            <motion.rect
              x={0}
              width={svgW}
              fill="white"
              initial={{ y: 0, height: 0 }}
              animate={
                phase === "pouring"
                  ? { y: 0, height: svgH }
                  : { y: svgH, height: 0 }
              }
              transition={
                phase === "pouring"
                  ? { duration: 0.12, ease: "easeOut" }
                  : { duration: 0.1, ease: "easeIn" }
              }
            />
          </mask>
        </defs>

        <g mask={`url(#${maskId})`}>
          {/* Main stream body */}
          <path d={streamPath} fill={`url(#${gradId})`} />

          {/* Liquid highlight */}
          <path d={streamPath} fill={`url(#${gradId}-hl)`} />

          {/* Flowing particles along center line */}
          <motion.path
            d={centerPath}
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="3 7"
            initial={{ strokeDashoffset: 0 }}
            animate={{ strokeDashoffset: -40 }}
            transition={{
              duration: 0.4,
              repeat: Infinity,
              ease: "linear",
            }}
          />

          {/* Slightly darker edge lines for definition */}
          <path
            d={centerPath}
            fill="none"
            stroke={color}
            strokeWidth={streamWidth + 1}
            strokeLinecap="round"
            opacity={0.15}
          />
        </g>

        {/* Small splash drops at destination */}
        {phase === "pouring" && isFinite(lx2) && isFinite(ly2) && (
          <>
            <motion.circle
              r={1.5}
              fill={color}
              initial={{
                cx: lx2 - 4,
                cy: ly2,
                opacity: 0,
              }}
              animate={{
                cy: [ly2, ly2 - 6, ly2],
                cx: [lx2 - 4, lx2 - 7, lx2 - 4],
                opacity: [0, 0.6, 0],
              }}
              transition={{
                duration: 0.35,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
            <motion.circle
              r={1}
              fill={color}
              initial={{
                cx: lx2 + 4,
                cy: ly2,
                opacity: 0,
              }}
              animate={{
                cy: [ly2, ly2 - 5, ly2],
                cx: [lx2 + 4, lx2 + 6, lx2 + 4],
                opacity: [0, 0.5, 0],
              }}
              transition={{
                duration: 0.3,
                repeat: Infinity,
                ease: "easeOut",
                delay: 0.1,
              }}
            />
          </>
        )}
      </svg>
    </div>
  );
}
