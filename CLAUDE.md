# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

lyric-dom is a framework-agnostic, zero-runtime-dependency karaoke lyric DOM renderer (TypeScript). Public API is exported from `src/index.ts`: `LyricRenderer`, config/DEFAULTS, `applyScrollPreroll`, `syncMainAndBackgroundLines`. Styles ship as `dist/style.css` (built from `src/renderer.css`) and are themeable purely through CSS variables with fallbacks (full table in README.md).

## Commands (use pnpm, not npm)

```bash
pnpm dev        # vite demo (root: demo/) at :5180, opens browser
pnpm build      # tsdown -> dist/ (esm index.mjs + style.css + d.ts)
pnpm test       # vitest run (happy-dom)
pnpm typecheck  # tsc --noEmit
pnpm lint       # biome check .
pnpm format     # biome format --write .
```

Single test: `pnpm exec vitest run tests/<file>.spec.ts`. Tests are discovered from `tests/**/*.spec.ts` under happy-dom (`vitest.config.ts`).

## Architecture

### Rendering model (the part that needs several files to grasp)

Lyrics are a flat, index-aligned array (`LyricLine[]`). Each main lyric line becomes an absolutely-positioned `.lp-line` div stacked inside `.lp-root > .lp-inner`. The engine does **not** rely on DOM flow — every frame it writes `transform: translateY(y) scale(s)` per line from per-line position/scale `Spring`s (`src/engine/spring.ts`, analytic spring solver, no rAF per instance). `calculateLayout` accumulates measured `lineHeights` up to the active line, centers the active line at `alignPosition`, and springs the rest with a cascade delay.

Playback time arrives via `setCurrentTime` (buffered to `pendingPlayTime`). A single `rAF` loop (`onAnimationFrame`) does, per frame: consume time → `processTime` (detect activations/deactivations/seek via `seekBackwardThreshold`/`seekForwardThreshold`; seek → `handleSeek`) → advance springs and write transforms → interpolate per-line alpha/blur and write CSS vars `--ba`/`--da` → update culling. Off-screen rows (y outside ±~500px) skip transform writes.

Word-by-word karaoke: each word is an inline span whose sung portion is revealed by CSS mask gradients driven by `--t` (current time). `--ba` (bright) / `--da` (dim) set the reveal states; masks are computed once by `measureAndApplyWordMasks`.

### Background (harmony) lines — nested, not stacked

Lines with `isBG: true` are **not** separate stacking rows. Each is nested as an absolute `.lp-line-bg` float *inside* its preceding main `.lp-line` (which gets `.has-bg`), at index `mainIdx + 1` in all arrays. The engine never writes a transform for a bg row; it activates bg together with its main (`lines[i + 1]?.isBG` pairing in `processTime`/`handleSeek`). When a bg is active, the main's row-group **expands an extra slot**: a per-frame progress value (`bgExpandValues`, 0→1) increases that main's advance so neighboring rows are smoothly pushed apart by springs (never overlapping the bg text). The float's opacity/scale/position are driven by `--lp-bg-progress`, written by the engine onto the `.lp-line-bg` float itself (not the host, to keep per-frame style invalidation scoped to the float subtree). A bg whose first word starts before its main's is placed **above** the main (`isBgAbove`, decided at build time); `syncMainAndBackgroundLines` (src/utils/normalize.ts) merges a pair's time windows so both activate/deactivate together. Pair ordering invariant: a bg must sit directly after its main in the array.

### Key files

- `src/engine/index.ts` — the whole engine (~1300 lines, single rAF). Tight, cache-heavy (parallel `Float64Array`s sized per line; alpha is `i*2`/`i*2+1`). Preserve index alignment when adding per-line state.
- `src/engine/line-builder.ts` + `word-builder.ts` — DOM construction (word spans, ruby, per-word romanization, subs); builder nests bg floats and returns index-aligned arrays incl. `isBgAbove`.
- `src/engine/constants.ts` — `DEFAULTS`, `RendererConfig` defaults.
- `src/utils/normalize.ts`, `scroll-preroll.ts` — lyrics preprocessing.
- `src/renderer.css` — all visuals via CSS variables; contains the `.lp-line-bg` seat rules.
- `demo/` — the vite app (imports `../src` + `../src/renderer.css`), lyric parsing via `lyric-kit`, live config panel.

### Test expectations

Tests (happy-dom) assert DOM classes and structure, not geometry: `container.querySelectorAll(".lp-line.active")` for main rows and `.lp-line-bg.active` for the nested bg float (bg is not a `.lp-line`), plus `.lp-roman-word`/`.lp-sub` for romanization. `offsetHeight` is 0 in happy-dom, so layout uses the `|| 40` fallback — visual geometry is only verifiable in the `pnpm dev` demo.

## Conventions

- Zero runtime dependencies; framework-agnostic DOM; keep it that way.
- Source comments are terse and mostly Chinese; match that.
- Every method carries a concise JSDoc (`/** … @param … */`) in the repo's existing doc style.
- Comments must not contain numbered itemized enumerations (no "1、2、3" style lists); write them as short plain clauses instead.
- Fixing code: do not add "why this was changed" prose to comments; put the reasoning in the reply, not the code.
- Commit messages are one-line titles, no body.
- Never commit until all checks pass: `pnpm typecheck && pnpm test && pnpm lint`.
