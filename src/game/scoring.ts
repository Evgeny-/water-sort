export interface ScoreBreakdown {
  base: number;
  efficiency: number;
  undoFine: number;
  bottleFine: number;
  score: number;
  maxScore: number;
  stars: number;
}

export function calculateScore(
  moves: number,
  par: number,
  undoCount: number,
  level: number,
  extraBottles: number = 0,
): ScoreBreakdown {
  const base = 100 + (level - 1) * 10;

  // Efficiency: scaled to base so impact is consistent across levels
  // Bonus: +20% of base per move under par
  // Penalty: -10% of base per move over par (after grace zone)
  // Grace zone: no penalty if moves are within 10% above par
  const bonusPerMove = Math.round(base * 0.1);
  const penaltyPerMove = Math.round(base * 0.05);
  const grace = Math.floor(par * 0.1);
  const diff = par - moves;
  const efficiency =
    diff >= 0
      ? diff * bonusPerMove
      : moves <= par + grace
        ? 0
        : (par + grace - moves) * penaltyPerMove;

  // Undo fine: 5% of base per undo used, capped at 50% of base
  const undoFine =
    undoCount > 0
      ? Math.min(Math.round(base * 0.05) * undoCount, Math.round(base * 0.5))
      : 0;

  // Bottle fine: 10% of base per extra bottle bought
  const bottleFine =
    extraBottles > 0 ? Math.round(base * 0.1) * extraBottles : 0;

  const score = Math.max(0, base + efficiency - undoFine - bottleFine);

  // Max possible score: par moves, no undos, no extra bottles
  const maxScore = base;

  // Star rating based on score % of max
  const pct = maxScore > 0 ? score / maxScore : 0;
  let stars: number;
  if (pct >= 0.85) {
    stars = 3;
  } else if (pct >= 0.5) {
    stars = 2;
  } else {
    stars = 1;
  }

  return {
    base,
    efficiency,
    undoFine,
    bottleFine,
    score,
    maxScore,
    stars,
  };
}
