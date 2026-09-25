# Water Sort Lab

A standalone prototype of the next version of the game, kept apart from the
main app in `../src`: 3D water rendered with Three.js, new mechanics and
difficulty measured by simulation.

```bash
npm install
npm run dev        # http://localhost:5180
```

## What's inside

- **Difficulty tracks.** The player picks Easy / Medium / Hard / Very hard in
  the menu; each is a track of 25 levels with its own progress.
  Difficulty rises gently inside a track and every 5th level is a challenge.
- **Mechanics.** Jar, orders, locks, valve, mini flask and hidden layers, freely
  combined. Every track starts with a mechanic; hidden layers act as a modifier
  on top of the others.
- **Free mode.** Any mechanic at any difficulty.
- **Difficulty metric.** Planning effort: a search that tries natural moves
  first and backtracks out of dead ends, like a player with undo.
  D = log2(positions explored per solution move) / 6.

## Layout

```
src/engine/     rules, solver (BFS, beam, effort search), level generator
src/render/     Three.js stage: vessels, liquid and glass shaders, animations
src/ui/         screens, HUD, sound
src/levels/     generated levels (track0–3.json, free.json)
scripts/        level builders and the analysis report
analysis/       measured data; levels/ and free/ hold the raw builds that get merged
```

## Rebuilding levels

```bash
npm run tracks                                   # all four tracks (slow)
TRACK=3 ONLY=7,21 RESEED=1 npm run tracks        # rebuild a few levels
npm run free                                     # free-mode pool
npm run report                                   # report/report.html
```

A rebuild only replaces a saved level when it lands closer to its target.
