import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IoArrowBack,
  IoArrowUndo,
  IoRefresh,
  IoVolumeHigh,
  IoVolumeMute,
  IoStar,
  IoLockClosed,
} from "react-icons/io5";
import { Tube, TubeSharedDefs } from "./Tube";
import { PourAnimationOverlay } from "./PourAnimationOverlay";
import { LevelCompleteOverlay } from "./LevelCompleteOverlay";
import { useGameState } from "../hooks/useGameState";
import { useAudio } from "../hooks/useAudio";
import { audioManager } from "../audio/audioManager";
import { calculateScore } from "../game/scoring";
import type { ScoreBreakdown } from "../game/scoring";
import type { Tube as TubeType } from "../game/types";

const IS_DEV = import.meta.env.DEV;

// Tube pixel dimensions (must match Tube.tsx constants)
const TUBE_W = 64;
const TUBE_H = 176;
const GAP_X = 16;
const GAP_Y = 32;
// Extra vertical room for selected-tube lift + wave
const LIFT_PADDING = 28;
// Max grid width so tubes don't spread into one wide row on desktop
const MAX_GRID_W = 480;
// Horizontal padding inside the board area
const BOARD_PAD_X = 16;

interface GridLayout {
  cols: number;
  rows: number;
  scale: number;
  gridW: number; // unscaled grid width
  gridH: number; // unscaled grid height
}

/**
 * Compute the best grid layout so all tubes fill the available board area.
 * Tries different column counts and picks the one with the largest scale.
 * Returns the chosen layout so we can set explicit dimensions on the grid.
 */
function computeLayout(
  tubeCount: number,
  containerW: number,
  containerH: number,
): GridLayout {
  const fallback: GridLayout = {
    cols: tubeCount,
    rows: 1,
    scale: 1,
    gridW: 0,
    gridH: 0,
  };
  if (tubeCount === 0 || containerW <= 0 || containerH <= 0) return fallback;

  const availW = Math.min(containerW - BOARD_PAD_X * 2, MAX_GRID_W);
  const availH = containerH - LIFT_PADDING;
  let best: GridLayout = fallback;

  for (let cols = 1; cols <= tubeCount; cols++) {
    const rows = Math.ceil(tubeCount / cols);
    const gridW = cols * TUBE_W + (cols - 1) * GAP_X;
    const gridH = rows * TUBE_H + (rows - 1) * GAP_Y;
    const scaleX = availW / gridW;
    const scaleY = availH / gridH;
    const scale = Math.min(scaleX, scaleY, 1); // never zoom above 1
    if (scale > best.scale || best.gridW === 0) {
      best = { cols, rows, scale, gridW, gridH };
    }
  }

  return best;
}

interface GameProps {
  initialTubes: TubeType[];
  initialLockedMask: boolean[][];
  levelNumber: number;
  par: number;
  paidTubes: number;
  tubeCost: number;
  totalScore: number;
  onSpendScore: (amount: number) => void;
  onNewLevel: () => void;
  onBack: () => void;
  onLevelComplete: (levelNumber: number, stars: number, score: number) => void;
}

export function Game({
  initialTubes,
  initialLockedMask,
  levelNumber,
  par,
  paidTubes,
  tubeCost,
  totalScore,
  onSpendScore,
  onNewLevel,
  onBack,
  onLevelComplete,
}: GameProps) {
  const {
    state,
    selectTube,
    unlockPaidTube,
    commitPour,
    finishPourAnim,
    undo,
    restart,
    levelComplete,
    stuck,
  } = useGameState(initialTubes, initialLockedMask);
  const { sfxMuted, toggleSfxMute } = useAudio();

  // Paid tube indices are the last N tubes in the array
  const paidTubeStart = initialTubes.length - paidTubes;
  const isPaidTube = (i: number) => i >= paidTubeStart;
  const isPaidLocked = (i: number) =>
    isPaidTube(i) && !state.unlockedPaidTubes.has(i);
  const hasLockedPaidTubes = Array.from(
    { length: paidTubes },
    (_, k) => paidTubeStart + k,
  ).some(isPaidLocked);
  const canAfford = totalScore >= tubeCost;

  // Confirmation dialog state
  const [showBuyConfirm, setShowBuyConfirm] = useState(false);

  const handleBuyTube = useCallback(() => {
    audioManager.playButtonClick();
    setShowBuyConfirm(true);
  }, []);

  const confirmBuyTube = useCallback(() => {
    // Find the first locked paid tube and unlock it
    for (let i = paidTubeStart; i < initialTubes.length; i++) {
      if (!state.unlockedPaidTubes.has(i)) {
        onSpendScore(tubeCost);
        unlockPaidTube(i);
        break;
      }
    }
    setShowBuyConfirm(false);
    audioManager.playButtonClick();
  }, [
    paidTubeStart,
    initialTubes.length,
    state.unlockedPaidTubes,
    onSpendScore,
    tubeCost,
    unlockPaidTube,
  ]);

  const cancelBuyTube = useCallback(() => {
    setShowBuyConfirm(false);
    audioManager.playButtonClick();
  }, []);

  const isAnimating = state.pourAnim !== null;

  // Delay showing stuck toast so the player has time to think
  const [showStuck, setShowStuck] = useState(false);
  useEffect(() => {
    if (stuck) {
      const timer = setTimeout(() => setShowStuck(true), 3000);
      return () => clearTimeout(timer);
    }
    setShowStuck(false);
  }, [stuck]);

  // --- Audio triggers ---

  // Play invalid sound when a tube shakes
  const prevInvalidRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      state.invalidTube !== null &&
      state.invalidTube !== prevInvalidRef.current
    ) {
      audioManager.playInvalid();
    }
    prevInvalidRef.current = state.invalidTube;
  }, [state.invalidTube]);

  // Play pour sound when pour animation starts
  const prevPourRef = useRef(false);
  useEffect(() => {
    if (state.pourAnim && !prevPourRef.current) {
      const duration = 100 + state.pourAnim.count * 100;
      audioManager.playPour(duration);
    }
    prevPourRef.current = state.pourAnim !== null;
  }, [state.pourAnim]);

  // Play level complete fanfare
  const prevCompleteRef = useRef(false);
  useEffect(() => {
    if (levelComplete && !prevCompleteRef.current) {
      audioManager.playLevelComplete();
    }
    prevCompleteRef.current = levelComplete;
  }, [levelComplete]);

  const boardRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tubeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [layout, setLayout] = useState<GridLayout>({
    cols: state.tubes.length,
    rows: 1,
    scale: 1,
    gridW: 0,
    gridH: 0,
  });

  // Count only visible tubes for layout (exclude locked paid tubes)
  const visibleTubeCount = state.tubes.filter(
    (_, i) => !isPaidLocked(i),
  ).length;
  const disableIdleWave = visibleTubeCount >= 16;

  const updateLayout = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    setLayout(computeLayout(visibleTubeCount, el.clientWidth, el.clientHeight));
  }, [visibleTubeCount]);

  useEffect(() => {
    updateLayout();
    const ro = new ResizeObserver(updateLayout);
    if (boardRef.current) ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, [updateLayout]);

  const [devSkipResult, setDevSkipResult] = useState<ScoreBreakdown | null>(
    null,
  );

  const devSkipLevel = useCallback(() => {
    const base = 100 + (levelNumber - 1) * 10;
    const finePct = Math.random() * 0.3; // 0–30%
    const totalFine = Math.round(base * finePct);
    // Split the fine randomly between efficiency loss and undo fine
    const undoFine = Math.round(totalFine * Math.random());
    const efficiency = -(totalFine - undoFine);
    const score = Math.max(0, base + efficiency - undoFine);
    const pct = base > 0 ? score / base : 0;
    const stars = pct >= 0.85 ? 3 : pct >= 0.5 ? 2 : 1;
    setDevSkipResult({
      base,
      efficiency,
      undoFine,
      bottleFine: 0,
      score,
      maxScore: base,
      stars,
    });
  }, [levelNumber]);

  const handleRetry = useCallback(() => {
    setDevSkipResult(null);
    reportedRef.current = false;
    restart();
  }, [restart]);

  const scoreResult = levelComplete
    ? calculateScore(
        state.moves.length,
        par,
        state.undoCount,
        levelNumber,
        state.unlockedPaidTubes.size,
      )
    : devSkipResult;

  const showComplete = levelComplete || devSkipResult !== null;

  // Report results to parent for persistence
  const reportedRef = useRef(false);
  useEffect(() => {
    if (scoreResult && showComplete && !reportedRef.current) {
      reportedRef.current = true;
      onLevelComplete(levelNumber, scoreResult.stars, scoreResult.score);
    }
  }, [scoreResult, showComplete, onLevelComplete, levelNumber]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            onClick={() => {
              audioManager.playButtonClick();
              onBack();
            }}
            className="btn btn-icon"
          >
            <IoArrowBack />
          </button>
          <span style={styles.levelLabel}>Level {levelNumber}</span>
          {totalScore > 0 && (
            <span
              className="score-badge"
              style={{ fontSize: 12, padding: "2px 8px" }}
            >
              <IoStar style={{ fontSize: 10, color: "#eab308" }} /> {totalScore}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={toggleSfxMute}
            className="btn btn-icon"
            style={{ fontSize: 18 }}
          >
            {sfxMuted ? <IoVolumeMute /> : <IoVolumeHigh />}
          </button>
          <span className="score-badge">
            {state.moves.length} / {par}
          </span>
        </div>
      </div>

      {/* Game board */}
      <div ref={boardRef} style={styles.board}>
        <TubeSharedDefs />
        {/* Outer wrapper sized to the scaled grid so flexbox centering works */}
        <div
          style={{
            width: layout.gridW * layout.scale,
            height: layout.gridH * layout.scale,
          }}
        >
          <div
            ref={gridRef}
            style={{
              ...styles.tubesGrid,
              width: layout.gridW,
              height: layout.gridH,
              transform: `scale(${layout.scale})`,
              transformOrigin: "top left",
              position: "relative",
            }}
          >
            {state.tubes.map((tube, i) => {
              if (isPaidLocked(i)) return null;
              const isAnimSource = state.pourAnim?.fromIndex === i;

              return (
                <div
                  key={i}
                  ref={(el) => {
                    tubeRefs.current[i] = el;
                  }}
                  style={{
                    opacity: isAnimSource ? 0 : 1,
                    position: "relative",
                  }}
                >
                  <Tube
                    tube={tube}
                    selected={state.selectedTube === i}
                    invalid={state.invalidTube === i}
                    onClick={() => {
                      audioManager.playTap();
                      selectTube(i);
                    }}
                    lockedMask={state.lockedMask[i]}
                    hidden={isAnimSource}
                    disableIdleWave={disableIdleWave}
                    simplified={disableIdleWave}
                  />
                </div>
              );
            })}

            {/* Pour animation overlay — renders animated clone above the grid */}
            {state.pourAnim && (
              <PourAnimationOverlay
                anim={state.pourAnim}
                gridRef={gridRef}
                tubeRefs={tubeRefs}
                onPour={commitPour}
                onFinished={finishPourAnim}
              />
            )}
          </div>
        </div>
      </div>

      {/* Stuck toast — fixed position so it doesn't shift layout */}
      <AnimatePresence>
        {showStuck && (
          <motion.div
            className="stuck-toast"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.3 }}
            style={styles.stuckToast}
          >
            No valid moves! Try undo or restart.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div style={styles.controls}>
        <button
          onClick={() => {
            audioManager.playUndo();
            undo();
          }}
          className="btn btn-control"
          disabled={state.moves.length === 0 || showComplete || isAnimating}
        >
          <IoArrowUndo /> Undo
        </button>
        <button
          onClick={() => {
            audioManager.playButtonClick();
            restart();
          }}
          className="btn btn-control"
          disabled={state.moves.length === 0 || showComplete || isAnimating}
        >
          <IoRefresh /> Restart
        </button>
        {hasLockedPaidTubes && !showComplete && (
          <button
            onClick={handleBuyTube}
            className="btn btn-control"
            disabled={!canAfford || isAnimating}
            style={{ color: canAfford ? "#fde68a" : undefined }}
          >
            <IoLockClosed /> Bottle{" "}
            <IoStar style={{ fontSize: 10, color: "#eab308" }} />
            {tubeCost}
          </button>
        )}
        {IS_DEV && !showComplete && (
          <button
            onClick={devSkipLevel}
            className="btn btn-control"
            style={{ opacity: 0.5, fontSize: 11 }}
          >
            Skip
          </button>
        )}
      </div>

      {/* Buy bottle confirmation */}
      <AnimatePresence>
        {showBuyConfirm && (
          <motion.div
            style={styles.confirmBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelBuyTube}
          >
            <motion.div
              style={styles.confirmDialog}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p style={styles.confirmTitle}>Unlock extra bottle?</p>
              <p style={styles.confirmCost}>
                <IoStar style={{ fontSize: 14, color: "#eab308" }} /> {tubeCost}{" "}
                points
              </p>
              <p style={styles.confirmBalance}>
                Your balance:{" "}
                <IoStar style={{ fontSize: 12, color: "#eab308" }} />{" "}
                {totalScore}
                {" → "}
                <IoStar style={{ fontSize: 12, color: "#eab308" }} />{" "}
                {totalScore - tubeCost}
              </p>
              <div style={styles.confirmButtons}>
                <button onClick={cancelBuyTube} className="btn btn-control">
                  Cancel
                </button>
                <button
                  onClick={confirmBuyTube}
                  className="btn btn-control"
                  style={{ color: "#fde68a" }}
                >
                  <IoLockClosed /> Unlock
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level complete overlay */}
      <AnimatePresence>
        {showComplete && scoreResult && (
          <LevelCompleteOverlay
            scoreResult={scoreResult}
            par={par}
            moves={state.moves.length}
            onNewLevel={onNewLevel}
            onRetry={handleRetry}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  levelLabel: {
    fontSize: 20,
    fontWeight: 700,
  },
  board: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: `0 ${BOARD_PAD_X}px`,
    overflow: "hidden",
  },
  tubesGrid: {
    display: "flex",
    gap: GAP_X,
    flexWrap: "wrap" as const,
    justifyContent: "center",
    alignContent: "center",
    rowGap: GAP_Y,
  },
  controls: {
    display: "flex",
    justifyContent: "center",
    gap: 16,
    padding: "20px",
  },
  stuckToast: {
    position: "fixed" as const,
    bottom: 100,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 24px",
    borderRadius: 20,
    background: "rgba(30, 30, 30, 0.9)",
    color: "#f87171",
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
    zIndex: 50,
    pointerEvents: "none" as const,
  },
  confirmBackdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  confirmDialog: {
    background: "#1e293b",
    border: "1px solid rgba(148, 163, 184, 0.3)",
    borderRadius: 16,
    padding: "24px 28px",
    textAlign: "center" as const,
    maxWidth: 300,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8,
  },
  confirmCost: {
    fontSize: 16,
    fontWeight: 600,
    color: "#fde68a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 4,
  },
  confirmBalance: {
    fontSize: 13,
    color: "#94a3b8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 20,
  },
  confirmButtons: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
  },
};
