export interface ScoreBreakdown {
  base: number;
  efficiency: number;
  undoFine: number;
  score: number;
  maxScore: number;
  stars: number;
}

export function calculateScore(
  moves: number,
  par: number,
  undoCount: number,
  level: number,
): ScoreBreakdown {
  const base = 100 + (level - 1) * 10;

  // Efficiency: +20 per move under par, -10 per move over par
  const diff = par - moves;
  const efficiency = diff >= 0 ? diff * 20 : diff * 10; // diff is negative when over par

  // Undo fine: 5% of base per undo used, capped at 50% of base
  const undoFine = undoCount > 0
    ? Math.min(Math.round(base * 0.05) * undoCount, Math.round(base * 0.5))
    : 0;

  const score = Math.max(0, base + efficiency - undoFine);

  // Max possible score: par moves, no undos
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
    score,
    maxScore,
    stars,
  };
}
