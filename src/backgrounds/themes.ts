export type DecorationType = "bubbles" | "orbs" | "sparkles" | "mixed";

export interface BackgroundTheme {
  name: string;
  /** Base gradient colors (dark, OLED-friendly) — will be combined with varied angles/positions */
  gradientColors: [string, string, string];
  /** 2-3 accent colors used for floating decorative elements */
  accentColors: string[];
  /** Style of decorations */
  decorationType: DecorationType;
}

/** Palette of 20 distinct themes — shuffled per level so they don't repeat predictably */
const palette: BackgroundTheme[] = [
  {
    name: "Deep Ocean",
    gradientColors: ["#0a1628", "#0c2340", "#0a1a30"],
    accentColors: ["#0ea5e9", "#38bdf8", "#0284c7"],
    decorationType: "bubbles",
  },
  {
    name: "Emerald Forest",
    gradientColors: ["#052e16", "#0a3d20", "#071a0f"],
    accentColors: ["#34d399", "#10b981", "#6ee7b7"],
    decorationType: "mixed",
  },
  {
    name: "Sunset Horizon",
    gradientColors: ["#1a0525", "#2d1030", "#1a0a10"],
    accentColors: ["#f59e0b", "#f97316", "#fb923c"],
    decorationType: "orbs",
  },
  {
    name: "Aurora",
    gradientColors: ["#0a0f20", "#0a2025", "#15103a"],
    accentColors: ["#06b6d4", "#a855f7", "#22d3ee"],
    decorationType: "mixed",
  },
  {
    name: "Volcanic",
    gradientColors: ["#2a0a0a", "#1f0808", "#120505"],
    accentColors: ["#ef4444", "#f97316", "#dc2626"],
    decorationType: "orbs",
  },
  {
    name: "Cosmic",
    gradientColors: ["#1a0a30", "#0f0a25", "#080818"],
    accentColors: ["#a78bfa", "#ec4899", "#c084fc"],
    decorationType: "sparkles",
  },
  {
    name: "Golden Sands",
    gradientColors: ["#1a1408", "#201a0c", "#151005"],
    accentColors: ["#fbbf24", "#d97706", "#fde68a"],
    decorationType: "mixed",
  },
  {
    name: "Frozen",
    gradientColors: ["#0a1a25", "#0c2535", "#081520"],
    accentColors: ["#e0f2fe", "#7dd3fc", "#bae6fd"],
    decorationType: "sparkles",
  },
  {
    name: "Neon City",
    gradientColors: ["#0a0515", "#150a20", "#080510"],
    accentColors: ["#f472b6", "#818cf8", "#38bdf8"],
    decorationType: "orbs",
  },
  {
    name: "Starfield",
    gradientColors: ["#080c18", "#050810", "#020408"],
    accentColors: ["#e2e8f0", "#cbd5e1", "#f8fafc"],
    decorationType: "sparkles",
  },
  {
    name: "Midnight Rose",
    gradientColors: ["#1a0a18", "#250a15", "#100510"],
    accentColors: ["#fb7185", "#e11d48", "#fda4af"],
    decorationType: "bubbles",
  },
  {
    name: "Deep Jungle",
    gradientColors: ["#051a0a", "#0a2810", "#031208"],
    accentColors: ["#4ade80", "#16a34a", "#86efac"],
    decorationType: "bubbles",
  },
  {
    name: "Nebula",
    gradientColors: ["#100520", "#180a30", "#0a0515"],
    accentColors: ["#d946ef", "#a855f7", "#e879f9"],
    decorationType: "mixed",
  },
  {
    name: "Arctic Night",
    gradientColors: ["#0a1520", "#0f2030", "#081018"],
    accentColors: ["#67e8f9", "#06b6d4", "#a5f3fc"],
    decorationType: "sparkles",
  },
  {
    name: "Ember Glow",
    gradientColors: ["#1a1005", "#201508", "#150a02"],
    accentColors: ["#fb923c", "#ea580c", "#fdba74"],
    decorationType: "orbs",
  },
  {
    name: "Twilight",
    gradientColors: ["#0f0a1a", "#1a1030", "#0a0812"],
    accentColors: ["#818cf8", "#6366f1", "#a5b4fc"],
    decorationType: "mixed",
  },
  {
    name: "Cherry Blossom",
    gradientColors: ["#180810", "#200c15", "#100508"],
    accentColors: ["#f9a8d4", "#ec4899", "#fbcfe8"],
    decorationType: "bubbles",
  },
  {
    name: "Storm",
    gradientColors: ["#0a0e15", "#121820", "#080c12"],
    accentColors: ["#94a3b8", "#64748b", "#cbd5e1"],
    decorationType: "mixed",
  },
  {
    name: "Lagoon",
    gradientColors: ["#051a1a", "#082525", "#031515"],
    accentColors: ["#2dd4bf", "#14b8a6", "#5eead4"],
    decorationType: "bubbles",
  },
  {
    name: "Solar Flare",
    gradientColors: ["#1a1000", "#201805", "#120a00"],
    accentColors: ["#facc15", "#eab308", "#fef08a"],
    decorationType: "orbs",
  },
];

/** Simple seeded pseudo-random number generator for deterministic results */
export function seededRandom(seed: number): () => number {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Gradient shape variants — combined with theme colors for extra variety */
const GRADIENT_SHAPES = [
  (c: [string, string, string]) =>
    `radial-gradient(ellipse at 50% 0%, ${c[0]} 0%, ${c[1]} 45%, ${c[2]} 100%)`,
  (c: [string, string, string]) =>
    `radial-gradient(ellipse at 50% 100%, ${c[0]} 0%, ${c[1]} 45%, ${c[2]} 100%)`,
  (c: [string, string, string]) =>
    `radial-gradient(ellipse at 30% 20%, ${c[0]} 0%, ${c[1]} 50%, ${c[2]} 100%)`,
  (c: [string, string, string]) =>
    `radial-gradient(ellipse at 70% 80%, ${c[0]} 0%, ${c[1]} 50%, ${c[2]} 100%)`,
  (c: [string, string, string]) =>
    `radial-gradient(circle at 50% 50%, ${c[1]} 0%, ${c[0]} 40%, ${c[2]} 100%)`,
  (c: [string, string, string]) =>
    `linear-gradient(180deg, ${c[0]} 0%, ${c[1]} 50%, ${c[2]} 100%)`,
  (c: [string, string, string]) =>
    `linear-gradient(160deg, ${c[0]} 0%, ${c[1]} 45%, ${c[2]} 100%)`,
  (c: [string, string, string]) =>
    `linear-gradient(200deg, ${c[0]} 0%, ${c[1]} 45%, ${c[2]} 100%)`,
];

export interface ResolvedTheme {
  gradient: string;
  accentColors: string[];
  decorationType: DecorationType;
  decorationCount: number;
}

/**
 * Build a shuffled permutation of indices [0..n) using Fisher-Yates,
 * seeded for determinism. Produces a full cycle before any repeat.
 */
function buildPermutation(n: number, seed: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  const rand = seededRandom(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

// Pre-compute a shuffled order of palette indices.
// We create multiple "rounds" so 200 levels are covered,
// each round is a fresh shuffle to avoid repetition within a round.
const ROUNDS = Math.ceil(200 / palette.length);
const themeOrder: number[] = [];
for (let r = 0; r < ROUNDS; r++) {
  themeOrder.push(...buildPermutation(palette.length, 9973 + r * 6271));
}

// Also pre-shuffle gradient shape assignments per level
const shapeOrder: number[] = [];
const SHAPE_ROUNDS = Math.ceil(200 / GRADIENT_SHAPES.length);
for (let r = 0; r < SHAPE_ROUNDS; r++) {
  shapeOrder.push(...buildPermutation(GRADIENT_SHAPES.length, 4201 + r * 3571));
}

/**
 * Get a background theme for a specific level number.
 * Uses pre-computed shuffled permutations so:
 * - Same level always gets the same background
 * - All 20 color themes are used before any repeats
 * - Gradient shape varies independently from color theme
 * - Decoration layout is unique per level (seeded by level number)
 */
export function getThemeForLevel(levelNumber: number): ResolvedTheme {
  const idx = (levelNumber - 1) % themeOrder.length;
  const theme = palette[themeOrder[idx]!]!;

  const shapeIdx = (levelNumber - 1) % shapeOrder.length;
  const gradient = GRADIENT_SHAPES[shapeOrder[shapeIdx]!]!(theme.gradientColors);

  // Vary decoration count per level (12-18) using a simple hash
  const decorationCount = 12 + ((levelNumber * 13 + 5) % 7);

  return {
    gradient,
    accentColors: theme.accentColors,
    decorationType: theme.decorationType,
    decorationCount,
  };
}
