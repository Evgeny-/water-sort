import { useEffect, useRef, useState, type RefObject } from "react";
import { useAnimate } from "framer-motion";
import type { PourAnimation } from "../game/types";
import { TubeSVG, TUBE_SVG_WIDTH, TUBE_SVG_HEIGHT } from "./Tube";

interface PourAnimationOverlayProps {
  anim: PourAnimation;
  gridRef: RefObject<HTMLDivElement | null>;
  tubeRefs: RefObject<(HTMLDivElement | null)[]>;
  /** Called when tilt starts — commits tube state so destination fills in parallel */
  onPour: () => void;
  /** Called when return animation finishes — clears pourAnim to unmount overlay */
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
  const committedRef = useRef(false);

  useEffect(() => {
    const gridEl = gridRef.current;
    const fromEl = tubeRefs.current[anim.fromIndex];
    const toEl = tubeRefs.current[anim.toIndex];
    if (!gridEl || !fromEl || !toEl) return;

    // Get actual DOM positions relative to the grid container
    const gridRect = gridEl.getBoundingClientRect();
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    // Account for grid scale (transform: scale) — DOM rects are in screen px,
    // but our overlay is positioned in the unscaled grid coordinate space.
    const scale = gridRect.width > 0 ? gridEl.offsetWidth / gridRect.width : 1;

    const fromX = (fromRect.left - gridRect.left) * scale;
    const fromY = (fromRect.top - gridRect.top) * scale;
    const toX = (toRect.left - gridRect.left) * scale;
    const toY = (toRect.top - gridRect.top) * scale;

    // Set initial position to exactly cover the source tube
    scope.current.style.left = `${fromX}px`;
    scope.current.style.top = `${fromY}px`;

    const pourRight = toX >= fromX;
    const tiltDeg = pourRight ? 60 : -60;

    // transformOrigin is bottom-center: (W/2, H).
    // The neck center at (W/2, 0) is (0, -H) relative to the pivot.
    // CSS rotate(θ) is clockwise-positive, so after rotation the neck
    // offset from pivot becomes (H·sin(θ), -H·cos(θ)).
    // In parent coords: neck = (divLeft + x + W/2 + H·sin(θ), divTop + y + H - H·cos(θ))
    // We want the neck to land at (toX + W/2, toY):
    //   x = toX - fromX - H·sin(θ)
    //   y = toY - fromY - H + H·cos(θ)
    const rad = (tiltDeg * Math.PI) / 180; // signed radians
    const dx = toX - fromX - TUBE_SVG_HEIGHT * Math.sin(rad);
    const dy = toY - fromY - TUBE_SVG_HEIGHT + TUBE_SVG_HEIGHT * Math.cos(rad);

    const run = async () => {
      // Phase 1: Lift up
      await animate(
        scope.current,
        { y: -25, scale: 1.05 },
        {
          duration: 0.06,
          ease: "easeOut",
        },
      );

      // Phase 2+3: Move and tilt simultaneously
      await animate(
        scope.current,
        { x: dx, y: dy, rotate: tiltDeg },
        {
          duration: 0.2,
          ease: [0.22, 1, 0.36, 1],
        },
      );

      // Drain source + fill destination simultaneously
      setDraining(true);
      if (!committedRef.current) {
        committedRef.current = true;
        onPour();
      }
      await new Promise((r) => setTimeout(r, 160));

      // Phase 4: Tilt back
      await animate(
        scope.current,
        { rotate: 0 },
        {
          duration: 0.1,
          ease: "easeOut",
        },
      );

      // Phase 5: Return to original position
      await animate(
        scope.current,
        { x: 0, y: 0, scale: 1 },
        {
          duration: 0.12,
          ease: "easeInOut",
        },
      );

      // Unmount overlay
      onFinished();
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
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
  );
}
