# lyric-dom

A framework-agnostic karaoke lyrics renderer for the browser, built on the native DOM API with zero runtime dependencies.

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](#)
[![Zero Dependency](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#)

English | [简体中文](README.zh-CN.md)

## Installation

```bash
pnpm add lyric-dom
# or
npm install lyric-dom
```

## Quick Start

### Basic Setup

Import the renderer class along with its stylesheet:

```ts
import { LyricRenderer, applyScrollPreroll } from "lyric-dom";
import "lyric-dom/renderer.css";

const container = document.querySelector<HTMLDivElement>("#lyrics")!;

const renderer = new LyricRenderer(container, {
  playing: true,
  alignPosition: 0.35,
  onLineClick: (timeMs) => {
    player.seek(timeMs);
  },
});

// Pass lyric lines (applyScrollPreroll smoothly advances scroll timing before line singing starts)
renderer.setLyrics(applyScrollPreroll(lines));
```

### Playback Synchronization

Push playback progress on each animation frame or audio `timeupdate` event:

```ts
// Update playback progress (milliseconds)
renderer.setCurrentTime(currentTimeMs);

// Switch play / pause state
renderer.setPlaying(isPlaying);
```

### Resource Management & Page Visibility

```ts
// Suspend rendering loop when hidden (e.g. background tab or hidden window)
renderer.freeze();

// Resume rendering loop when returning to foreground
renderer.resume();

// Destroy renderer instance and clean up DOM and listeners
renderer.dispose();
```

### Song Credits & Bottom Container

Add custom credit information, arranger credits, or extra spacing below the last lyric line:

```ts
const bottomEl = renderer.getBottomLineElement();
bottomEl.textContent = "Lyricist: ... | Composer: ...";
```

### Styling with CSS Variables

Customize themes, font sizes, colors, and layout spacing through CSS custom properties:

```css
#lyrics {
  --lp-color: #ffffff;
  --lp-padding-x: 1.5em;
  --lp-duet-color: #38bdf8;
  --lp-sub-opacity: 0.4;
  --lp-dot-size: 0.45em;
}
```

---

## API Reference

### `LyricRenderer`

#### `new LyricRenderer(container, config?)`

- **`container`**: `HTMLElement` - Target container element to mount the renderer.
- **`config?`**: `Partial<RendererConfig>` - Optional initial configuration.

#### Methods

| Method                   | Parameters                        | Description                                                                                        |
| :----------------------- | :-------------------------------- | :------------------------------------------------------------------------------------------------- |
| `setLyrics(lines)`       | `lines: LyricLine[]`              | Set lyric lines, rebuild DOM structure, and trigger entrance animation.                            |
| `setCurrentTime(timeMs)` | `timeMs: number`                  | Push current playback timestamp in milliseconds.                                                   |
| `setPlaying(playing)`    | `playing: boolean`                | Set playback state; pauses or resumes active word sweep animations.                                |
| `setConfig(config)`      | `config: Partial<RendererConfig>` | Dynamically update renderer configurations.                                                        |
| `freeze()`               | -                                 | Suspend requestAnimationFrame loop and disconnect resize observers.                                |
| `resume()`               | -                                 | Resume requestAnimationFrame loop, re-observe dimensions, and resync animations.                   |
| `getBottomLineElement()` | -                                 | Returns the bottom container element (`.lp-credit`) located below the last lyric line.             |
| `dispose()`              | -                                 | Destroy the renderer instance, cancel animations, and remove all event listeners and DOM elements. |

### `RendererConfig`

| Option                  | Type                       | Default     | Description                                                                                   |
| :---------------------- | :------------------------- | :---------- | :-------------------------------------------------------------------------------------------- |
| `alignPosition`         | `number`                   | `0.35`      | Vertical alignment ratio of the active line in container (`0` to `1`, `0.35` = 35% from top). |
| `playing`               | `boolean`                  | `true`      | Current playback state.                                                                       |
| `springConfig`          | `Partial<SpringParams>`    | `{}`        | Custom spring physics parameters for scrolling and scaling animations.                        |
| `wordFadeWidth`         | `number`                   | `0.5`       | Word-by-word gradient mask transition width ratio.                                            |
| `scrollResetDelay`      | `number`                   | `5000`      | Delay in milliseconds before auto-springing back after user manual scroll.                    |
| `minInterludeGap`       | `number`                   | `4000`      | Minimum gap duration (ms) between lines to trigger interlude breathing dots.                  |
| `breatheCycleTarget`    | `number`                   | `1500`      | Target breathing animation cycle duration (ms) for interlude dots.                            |
| `alphaAttackSpeed`      | `number`                   | `50`        | Opacity transition attack speed when a line becomes active.                                   |
| `alphaReleaseSpeed`     | `number`                   | `7`         | Opacity transition release speed when a line becomes inactive.                                |
| `inactiveAlpha`         | `number`                   | `0.2`       | Base opacity for inactive lines.                                                              |
| `hidePassedLines`       | `boolean`                  | `false`     | Whether to fade out already played lines.                                                     |
| `enableBlur`            | `boolean`                  | `false`     | Whether to enable distance-based blur effect on inactive lines.                               |
| `enableWordHighlight`   | `boolean`                  | `true`      | Whether to enable word-by-word karaoke sweep highlighting.                                    |
| `enableFloatAnimation`  | `boolean`                  | `false`     | Whether to enable subtle upward floating animation on sung words.                             |
| `enableEmphasizeEffect` | `boolean`                  | `false`     | Whether to enable on-demand glow and motion emphasis for long notes.                          |
| `emphasizeMinDuration`  | `number`                   | `1000`      | Minimum note duration in milliseconds required for emphasis.                                 |
| `showTranslation`       | `boolean`                  | `true`      | Whether to display translated lyrics.                                                         |
| `showRomanization`      | `boolean`                  | `true`      | Whether to display romanized lyrics.                                                          |
| `onLineClick`           | `(timeMs: number) => void` | `undefined` | Callback invoked when clicking a lyric line, receiving line start time in ms.                 |

### `SpringParams`

Spring animation parameters based on damped harmonic oscillator physics:

| Parameter   | Type      | Default | Description                                                                                |
| :---------- | :-------- | :------ | :----------------------------------------------------------------------------------------- |
| `mass`      | `number`  | `1`     | Mass of the simulated object. Higher values yield greater inertia and slower acceleration. |
| `damping`   | `number`  | `10`    | Friction/damping coefficient controlling oscillation decay rate.                           |
| `stiffness` | `number`  | `100`   | Spring stiffness. Higher values snap to target faster.                                     |
| `soft`      | `boolean` | `false` | When `true`, forces over-damped mode (pure exponential decay without bounce).              |

### Utilities

#### `applyScrollPreroll(lines)`

Pre-rolls line start times so that the view scrolls into place before each line begins singing:

- Non-overlapping lines are advanced by up to 600 ms.
- Overlapping lines are capped at 400 ms or 30% of the preceding line's duration.

```ts
import { applyScrollPreroll } from "lyric-dom";

renderer.setLyrics(applyScrollPreroll(rawLines));
```

#### `DEFAULTS`

Exported constant containing all default configuration values of `RendererConfig`.

### CSS Variables

All styling is configured through CSS custom properties with built-in fallbacks:

| Variable                 | Default                 | Description                                                |
| :----------------------- | :---------------------- | :--------------------------------------------------------- |
| `--lp-color`             | `#fff`                  | Main lyric text color.                                     |
| `--lp-padding-x`         | `1em`                   | Horizontal padding of the inner lyric container.           |
| `--lp-line-padding`      | `0.4em 1em`             | Padding for each lyric line.                               |
| `--lp-duet-color`        | `var(--lp-color, #fff)` | Text color for duet lines.                                 |
| `--lp-duet-indent`       | `15%`                   | Indentation for duet layout (`8%` on screens <= 600px).    |
| `--lp-bg-font-size`      | `0.75em`                | Font size for background vocal lines (`isBG`).             |
| `--lp-bg-active-opacity` | `0.4`                   | Opacity for active background vocal lines.                 |
| `--lp-bg-tuck`           | `0.85em`                | Hidden offset a background float tucks into its main line. |
| `--lp-hover-bg`          | `color-mix(...)`        | Background color when hovering over a clickable line.      |
| `--lp-sub-font-size`     | `max(0.5em, 10px)`      | Font size for translation and romanization sub-text.       |
| `--lp-sub-line-height`   | `1.5em`                 | Line height for translation and romanization sub-text.     |
| `--lp-sub-opacity`       | `0.3`                   | Base opacity for translation and romanization sub-text.    |
| `--lp-sub-color`         | `inherit`               | Color for translation and romanization sub-text.           |
| `--lp-dot-size`          | `0.45em`                | Diameter of interlude breathing dots.                      |
| `--lp-credit-opacity`    | `0.3`                   | Opacity for bottom song credits container.                 |
| `--lyric-font-zh`        | `inherit`               | Font family override for Chinese lyrics (`:lang(zh)`).     |
| `--lyric-font-ja`        | `inherit`               | Font family override for Japanese lyrics (`:lang(ja)`).    |
| `--lyric-font-ko`        | `inherit`               | Font family override for Korean lyrics (`:lang(ko)`).      |
| `--lyric-font-latin`     | `inherit`               | Font family override for Latin lyrics (`:lang(und-Latn)`). |

### Data Models

```ts
type LyricLanguage = "ja" | "ko" | "zh-CN" | "und-Latn";

interface LyricLine {
  language?: LyricLanguage;
  words: LyricWord[];
  translatedLyric: string;
  romanLyric: string;
  startTime: number; // ms
  endTime: number; // ms
  isBG: boolean;
  isDuet: boolean;
}

interface LyricWord extends LyricSpan {
  romanWord?: string;
  obscene?: boolean;
  ruby?: LyricSpan[];
}

interface LyricSpan {
  startTime: number; // ms
  endTime: number; // ms
  word: string;
}
```

## Acknowledgements

- [amll-dev/applemusic-like-lyrics](https://github.com/amll-dev/applemusic-like-lyrics)
- [SPlayer-Dev/lyric-kit](https://github.com/SPlayer-Dev/lyric-kit)

## License

[AGPL-3.0](LICENSE) © [SPlayer-Dev](https://github.com/SPlayer-Dev)
