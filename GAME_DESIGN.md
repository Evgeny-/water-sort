# Water Sort Puzzle — Game Design Document

## 1. Core Concept

A set of **tubes** (bottles) filled with **colored liquid segments**. The player pours liquid between tubes to sort them — each tube must end up with a single color. Once a tube is fully sorted (5 segments of one color), it's "complete" and visually locks.

---

## 2. Rules

### Tube Structure
- Each tube holds exactly **5 units** (layers/segments) of liquid
- At level start, most tubes are full (5 layers of mixed colors), plus a small number of **empty tubes** used as working space
- Data model: array of arrays, e.g. `[["red","blue","green","red","blue"], ["blue","green","red","blue","green"], [], ...]` — each inner array is bottom-to-top

### Pouring Rules
There is exactly **one action**: pour from a source tube into a destination tube.

1. **Color match**: destination top color must match source top color, OR destination must be **empty**
2. **Space**: destination must have room (not full at 5)
3. **Consecutive transfer**: all consecutive same-color layers at the top of the source move together in one pour. Example: source is `[red, blue, blue]` → both blues pour at once
4. **Auto-stop**: pour stops when destination is full OR no more matching color on top of source
5. **No partial pours**: you always interact with the topmost contiguous color block — cannot skip or select deeper layers

### Win Condition
Every non-empty tube contains exactly **5 units of one color**. Empty tubes can stay empty. Level is complete.

### No Lose Condition
- Player can never "die" or get a game-over screen
- Player can reach a **deadlock** (no valid moves, puzzle unsorted) — this is "stuck"
- When stuck: **undo** moves or **restart** the level
- No time limit, no move limit (though moves are tracked for scoring)

---

## 3. Scoring System

### Points Per Level

| Factor | Points | Notes |
|---|---|---|
| Level completed | 100 base | Always awarded |
| Per move under par | +20 | Efficiency bonus |
| Per move over par | -5 | Gentle penalty (floor at 0 total) |
| No undo used | x1.5 multiplier | Applied to total |
| No restart used | x1.2 multiplier | Applied to total |
| Combo: consecutive tube completions | +50, +100, +150... | Completing tubes back-to-back without other moves |
| Speed bonus (optional) | +10 per 10s under time par | For competitive feel |

**Par** = precomputed optimal (or near-optimal) move count for each level.

### Star Rating (1–3 per level)
- **3 stars**: completed at or under par, no undo used
- **2 stars**: completed within 1.5x par
- **1 star**: completed at all

Stars are the primary currency for unlocking worlds and cosmetics.

---

## 4. Level Design

### Difficulty Curve (implemented)

| Level Range | Colors | Empty Tubes | Notes |
|---|---|---|---|
| 1–3 | 3 | 2 | Tutorial, very forgiving |
| 4–10 | 4 | 2 | Getting started |
| 11–20 | 5 | 2 | Standard play |
| 21–35 | 6 | 2 | More colors |
| 36–55 | 7 | 2 | Getting complex |
| 56–80 | 8 | 2 | Many colors |
| 81–110 | 9 | 2 | Advanced |
| 111–150 | 10 | 2 → 1 (at 131+) | Fewer empty tubes at 131+ |
| 151+ | 11–16 | 2 → 1 (at 181+) | Procedurally generated |

### What Makes Levels Harder
1. **More colors** — more to track mentally
2. **Fewer empty tubes** — 1 empty is dramatically harder than 2
3. **Deep burial** — target colors trapped under layers of other colors
4. **Similar colors** — light blue vs dark blue vs teal (visual difficulty)
5. **Longer minimum solutions** — some levels need 30+ moves minimum
6. **Interdependencies** — must partially unsort tube X to free space for tube Y

### Level Generation Algorithm (implemented)
1. Create a **flat pool** of all color segments (5 of each color)
2. **Fisher-Yates shuffle** the pool randomly
3. **Distribute** shuffled segments into tubes of 5 each, add empty tubes
4. **Verify solvability** via BFS solver (canonical state hashing, up to 300K states)
5. Compute **par** (optimal move count from solver)
6. **Reject** levels that are already solved, too easy (par < 3), or unsolvable
7. **Retry** up to 50 attempts to find a good puzzle; fallback to estimated par

---

## 5. Helpers / Power-Ups

All earned through play, never purchased (free game, no ads).

| Helper | How Earned | Effect |
|---|---|---|
| **Undo** | Always free, unlimited | Reverse last move. Using it affects star rating |
| **Restart** | Always free, unlimited | Reset level to initial state |
| **Extra Tube** | Earn 1 per 10 levels 3-starred | Adds an empty tube to current level |
| **Hint** | Earn 1 per 5 levels completed | Shows next optimal move (highlighted) |
| **Shuffle** | Earn 1 per world completed | Re-randomizes current level (verified still solvable) |

---

## 6. Interaction Design

### Two-Tap Model (implemented)
1. **Tap a tube** → it rises up with spring animation, visually selected
2. **Tap another tube** → pour happens with tilt animation (source tilts toward destination)
3. **Tap selected tube again** → deselect (tube lowers back)

### Visual Feedback (implemented)

| Event | Feedback |
|---|---|
| Tube selected | Tube **lifts up** (-20px) with smooth spring animation (stiffness 350, damping 28) |
| Pour in progress | Source tube **lifts** (-40px) and **tilts** (35°) toward destination, 350ms animation. Input blocked during pour |
| Invalid move | Target tube **shakes** horizontally (±6px decay), auto-clears after 500ms |
| Tube completed (single color, full) | **Green glow** border + box shadow |
| Level complete | **Overlay** with spring animation, **star rating** (spinning entrance), **score breakdown** |
| Stuck (no valid moves) | **Red banner** slides up: "No valid moves! Try undo or restart." |

### Haptic Feedback (mobile) — not yet implemented
- Light tap on select
- Satisfying pulse on successful pour
- Double-pulse on tube completion
- Celebration vibration pattern on level clear
- Short buzz on invalid move

### Layout (implemented)
- Tubes arranged in **flexbox wrap grid** centered on screen — wraps to multiple rows automatically
- Tube sizing: **50px wide**, **34px per segment**, 12px border radius
- **← Back button** to return to level selection
- **Undo** (↩) and **Restart** (↻) buttons at bottom, disabled when no moves or level complete
- **Level number** and **move counter / par** displayed in header
- Minimal chrome — the puzzle is the focus

---

## 7. Completed Tube Behavior (implemented)

When a tube is filled with 5 units of one color:
1. **Green glow** border and box-shadow effect
2. Tube **stays visible but locked** — cursor changes to default, cannot interact
3. Cannot be selected as source for pours
4. On level complete, score overlay appears over all tubes

---

## 8. Level Selection (implemented)

### Level Select Screen
- **5-column grid** of numbered level buttons
- Levels up to **highest reached** are tappable
- Locked levels display a **lock icon** (🔒) with reduced opacity
- **Current highest level** highlighted with blue border and glow
- Shows levels up to maxLevel + 10 or 30 (whichever is greater)
- **Scrollable** for many levels

### Level Progression
- Completing a level **unlocks the next level**
- Highest unlocked level persisted to **localStorage** (`water-sort-max-level`)
- Player can **replay any previously unlocked level** from level select
- **Back button** (←) in game header returns to level select at any time

---

## 9. Meta-Progression

### Player Profile — not yet implemented
- **Cumulative score** — total across all levels
- **Star collection** — total stars, used to unlock worlds and cosmetics
- **Levels completed** — progress tracker
- **Current world** — where the player is in the campaign

### Engagement Features — not yet implemented
- **Daily challenge** — one special level per day, bonus score reward
- **Streak counter** — consecutive days played, score multiplier bonus
- **Personal bests** — replay any completed level to beat your move count
- **Statistics dashboard** — total levels solved, average moves per level, best combos, total time played

### Cosmetic Unlocks (via star milestones) — not yet implemented
- Tube/bottle skins (glass, wooden barrel, neon, crystal, etc.)
- Background themes (lab, ocean, space, forest, etc.)
- Liquid styles (flat color, gradient, bubbly, glowing, etc.)
- Pour animation styles
- Sound packs

Example milestones:
- 50 stars → Neon tube skin
- 100 stars → Ocean background
- 200 stars → Gradient liquid style
- 500 stars → Crystal tube skin + space background

---

## 10. Common Variations (for future inspiration)

| Variation | Description |
|---|---|
| **Ball Sort** | Discrete balls instead of liquid. One ball per move (no consecutive merge) |
| **Locked Tubes** | Certain tubes locked until conditions met |
| **Mystery Colors** | Colors hidden/obscured, adds memory element |
| **Extra-Long Tubes** | Tubes holding 6+ units |
| **Timed Mode** | Time pressure for bonus rewards |
| **Limited Moves** | Must solve within N moves |
| **Multiplayer Race** | Two players sort simultaneously, first to finish wins |

---

## 11. Technical Notes

### Tech Stack
- **React 19** + **TypeScript** — UI framework
- **Framer Motion 11** — spring-based animations
- **Vite 6** — build tool
- **localStorage** — persistence (level progress)

### Color Palette (16 colors)
red, blue, green, yellow, purple, orange, pink, teal, indigo, lime, cyan, rose, amber, emerald, violet, sky

### Level Solvability
- The Water Sort puzzle is **NP-complete** in general
- All levels **verified solvable** via BFS solver before presenting to the player
- Solver uses **canonical state hashing** (sorted tube representation) for deduplication
- **Pruning**: skips moving single-color tubes to empty tubes (pointless moves)
- **Cap**: 300,000 states max to avoid browser freeze; returns null for too-complex levels
- With 2 empty tubes, most random configurations are solvable
- With 1 empty tube, solvability is not guaranteed — must verify

### State Representation
```
Level = {
  tubes: [["red","blue","green","red","blue"], ["blue","green","red","blue","green"], [], []],
  par: 12,
  colors: 3,
  world: 1,
  levelNumber: 5
}
```

### Move Representation
```
Move = { from: tubeIndex, to: tubeIndex }
// Amount transferred is determined by the rules (all consecutive same-color on top)
```

### Key Algorithm: Is Pour Valid?
```
canPour(source, destination):
  if source is empty → false
  if destination is full (length == 5) → false
  if destination is empty → true
  if topColor(source) == topColor(destination) → true
  else → false
```

### Key Algorithm: Execute Pour
```
pour(source, destination):
  color = topColor(source)
  count = consecutive count of color at top of source
  space = 5 - destination.length
  transferred = min(count, space)
  remove top `transferred` units from source
  add `transferred` units of `color` to destination
```

### Scoring Algorithm (implemented)
```
calculateScore(moves, par, undoCount, restartCount, comboBonus):
  base = 100
  efficiency = (par - moves) >= 0 ? (par - moves) * 20 : (par - moves) * 5
  subtotal = max(0, base + efficiency + comboBonus)
  undoMultiplier = undoCount == 0 ? 1.5 : 1
  restartMultiplier = restartCount == 0 ? 1.2 : 1
  score = round(subtotal * undoMultiplier * restartMultiplier)
```

### Combo Detection (implemented)
- Track completed tube count after each move
- If new tubes completed AND combo counter > 0, increment chain
- Bonus: `comboCounter * 50` per additional completion in chain
- Chain resets when a move completes no new tubes

---

## 12. Project File Structure

```
src/
├── game/
│   ├── types.ts         — Color, Tube, Move, Level, GameState, PourAnim, COLORS
│   ├── engine.ts        — canPour, pour, topColor, topCount, isTubeComplete,
│   │                      isLevelComplete, getValidMoves, isStuck, createGameState
│   ├── levels.ts        — getDifficulty, generateTubes (Fisher-Yates), createLevel
│   ├── solver.ts        — BFS solver with canonical hashing, solve()
│   └── scoring.ts       — calculateScore, ScoreBreakdown
├── components/
│   ├── Game.tsx          — Main game screen (header, board, controls, overlays)
│   ├── Tube.tsx          — Single tube rendering (selection, pour tilt, shake, glow)
│   └── LevelSelect.tsx   — Level selection grid screen
├── hooks/
│   └── useGameState.ts   — Game state management (two-phase pour, combos, stuck)
├── App.tsx               — Screen routing (level select ↔ game), localStorage
├── main.tsx              — Entry point
└── index.css             — Global styles, CSS variables, mobile optimizations
```
