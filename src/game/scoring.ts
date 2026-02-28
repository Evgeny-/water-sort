export interface ScoreBreakdown {
  base: number;
  efficiency: number;
  comboBonus: number;
  subtotal: number;
  undoMultiplier: number;
  restartMultiplier: number;
  score: number;
  stars: number;
}

export function calculateScore(
  moves: number,
  par: number,
  undoCount: number,
  restartCount: number,
  comboBonus: number,
): ScoreBreakdown {
  const base = 100;

  // Efficiency: +20 per move under par, -5 per move over par
  const diff = par - moves;
  const efficiency = diff >= 0 ? diff * 20 : diff * 5; // diff is negative when over par

  const subtotal = Math.max(0, base + efficiency + comboBonus);

  const undoMultiplier = undoCount === 0 ? 1.5 : 1;
  const restartMultiplier = restartCount === 0 ? 1.2 : 1;

  const score = Math.round(subtotal * undoMultiplier * restartMultiplier);

  // Star rating
  let stars: number;
  if (moves <= par && undoCount === 0) {
    stars = 3;
  } else if (moves <= Math.ceil(par * 1.5)) {
    stars = 2;
  } else {
    stars = 1;
  }

  return {
    base,
    efficiency,
    comboBonus,
    subtotal,
    undoMultiplier,
    restartMultiplier,
    score,
    stars,
  };
}
