import { motion } from "framer-motion";
import { type Tube as TubeType, TUBE_CAPACITY, COLORS } from "../game/types";
import { isTubeComplete } from "../game/engine";

const SEGMENT_HEIGHT = 34;
const TUBE_WIDTH = 50;
const TUBE_PADDING = 4;
const TUBE_BORDER_RADIUS = 12;
const TUBE_INNER_RADIUS = TUBE_BORDER_RADIUS - TUBE_PADDING;
const TUBE_HEIGHT = SEGMENT_HEIGHT * TUBE_CAPACITY + TUBE_PADDING * 2;

interface TubeProps {
  tube: TubeType;
  selected: boolean;
  invalid: boolean;
  onClick: () => void;
}

export function Tube({ tube, selected, invalid, onClick }: TubeProps) {
  const complete = isTubeComplete(tube);

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
        width: TUBE_WIDTH,
        height: TUBE_HEIGHT,
        borderRadius: TUBE_BORDER_RADIUS,
        border: `2px solid ${complete ? "rgba(34, 197, 94, 0.6)" : "var(--tube-glass-border)"}`,
        background: "var(--tube-glass)",
        position: "relative",
        cursor: complete ? "default" : "pointer",
        overflow: "hidden",
        padding: TUBE_PADDING,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 0,
        boxShadow: complete
          ? "0 0 20px rgba(34, 197, 94, 0.3)"
          : selected
            ? "0 0 15px rgba(59, 130, 246, 0.4)"
            : "none",
      }}
    >
      {tube.map((color, i) => {
        const isBottom = i === 0;
        const isTop = i === tube.length - 1;

        return (
          <motion.div
            key={i}
            layout
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            style={{
              width: "100%",
              height: SEGMENT_HEIGHT,
              background: COLORS[color] ?? color,
              borderRadius: getBorderRadius(isBottom, isTop),
              transformOrigin: "bottom",
            }}
          />
        );
      })}
    </motion.div>
  );
}

function getBorderRadius(isBottom: boolean, isTop: boolean): string {
  const r = TUBE_INNER_RADIUS;
  const top = isTop ? r : 0;
  const bottom = isBottom ? r : 0;
  return `${top}px ${top}px ${bottom}px ${bottom}px`;
}
