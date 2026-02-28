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
    gradientColors: ["#06101e", "#0b2545", "#0a1628"],
    accentColors: ["#1e8fc7", "#4db8e0", "#0c6fa3"],
    decorationType: "bubbles",
  },
  {
    name: "Enchanted Grove",
    gradientColors: ["#061f0e", "#0d3520", "#041a0a"],
    accentColors: ["#4ec98b", "#8edbb5", "#2a9d6a"],
    decorationType: "mixed",
  },
  {
    name: "Molten Dusk",
    gradientColors: ["#1f0a12", "#301520", "#180810"],
    accentColors: ["#d4845a", "#c0603a", "#e8a878"],
    decorationType: "orbs",
  },
  {
    name: "Aurora Borealis",
    gradientColors: ["#060e1e", "#0a2028", "#100830"],
    accentColors: ["#2ec4b6", "#8b5cf6", "#5de5d5"],
    decorationType: "mixed",
  },
  {
    name: "Magma Core",
    gradientColors: ["#220808", "#1a0505", "#100303"],
    accentColors: ["#c93c3c", "#e07830", "#a02020"],
    decorationType: "orbs",
  },
  {
    name: "Cosmic Dust",
    gradientColors: ["#140828", "#0c0620", "#060410"],
    accentColors: ["#9578d4", "#c86aaf", "#b898e8"],
    decorationType: "sparkles",
  },
  {
    name: "Amber Cavern",
    gradientColors: ["#181008", "#1e160a", "#120c04"],
    accentColors: ["#c9a040", "#a07828", "#ddc070"],
    decorationType: "mixed",
  },
  {
    name: "Glacial Depths",
    gradientColors: ["#081820", "#0a2535", "#061218"],
    accentColors: ["#a8d8ea", "#6ab8d4", "#c0e8f4"],
    decorationType: "sparkles",
  },
  {
    name: "Neon Alley",
    gradientColors: ["#0c0418", "#180c24", "#08030e"],
    accentColors: ["#d468a8", "#7080e0", "#40b8d8"],
    decorationType: "orbs",
  },
  {
    name: "Deep Space",
    gradientColors: ["#050810", "#03060c", "#020306"],
    accentColors: ["#c8d0e0", "#a0aac0", "#e8ecf4"],
    decorationType: "sparkles",
  },
  {
    name: "Crimson Garden",
    gradientColors: ["#180810", "#240c18", "#10050a"],
    accentColors: ["#d46878", "#a83050", "#e8a0b0"],
    decorationType: "bubbles",
  },
  {
    name: "Bioluminescence",
    gradientColors: ["#041810", "#082818", "#02100a"],
    accentColors: ["#58d890", "#30b068", "#80e8b0"],
    decorationType: "bubbles",
  },
  {
    name: "Nebula Veil",
    gradientColors: ["#120620", "#1c0c34", "#0a0418"],
    accentColors: ["#b848c8", "#8840a8", "#d470e0"],
    decorationType: "mixed",
  },
  {
    name: "Polar Twilight",
    gradientColors: ["#081418", "#0c2028", "#060c10"],
    accentColors: ["#58c8d8", "#3098b0", "#80e0e8"],
    decorationType: "sparkles",
  },
  {
    name: "Copper Forge",
    gradientColors: ["#180e06", "#201208", "#100802"],
    accentColors: ["#c87840", "#a05820", "#e09860"],
    decorationType: "orbs",
  },
  {
    name: "Indigo Dream",
    gradientColors: ["#0c0818", "#14102a", "#08060e"],
    accentColors: ["#6870c0", "#5058a8", "#8890d8"],
    decorationType: "mixed",
  },
  {
    name: "Sakura Night",
    gradientColors: ["#140810", "#1c0c18", "#0c0408"],
    accentColors: ["#d890b8", "#c060a0", "#e8b8d0"],
    decorationType: "bubbles",
  },
  {
    name: "Thunderhead",
    gradientColors: ["#0c1018", "#141c24", "#080e14"],
    accentColors: ["#8898b0", "#607090", "#b0c0d0"],
    decorationType: "mixed",
  },
  {
    name: "Jade Lagoon",
    gradientColors: ["#061818", "#0a2828", "#041414"],
    accentColors: ["#40b8a8", "#28a090", "#68d0c0"],
    decorationType: "bubbles",
  },
  {
    name: "Harvest Moon",
    gradientColors: ["#181208", "#20180c", "#100c04"],
    accentColors: ["#c8a830", "#a88818", "#e0c858"],
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
