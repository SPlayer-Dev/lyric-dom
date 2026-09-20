import { LyricRenderer } from "../src";
import type { LyricLine } from "../src/types";
import {
  CONTROL_DEFS,
  clearSavedState,
  createInitialState,
  type DemoState,
  loadState,
  SPRING_PRESETS,
  type SpringPreset,
  saveState,
} from "./config";
import { parseLyricFile } from "./importer";
import { buildPanel } from "./panel";
import { DemoPlayer } from "./player";
import "../src/renderer.css";
import "./style.css";

// ---- DOM 元素 ----
const container = document.getElementById("lyrics-container") as HTMLDivElement;
const emptyPlaceholder = document.getElementById("empty-placeholder") as HTMLDivElement;
const audio = document.getElementById("audio") as HTMLAudioElement;
const playBtn = document.getElementById("play-btn") as HTMLButtonElement;
const timeLabel = document.getElementById("time-label") as HTMLSpanElement;
const timeSlider = document.getElementById("time-slider") as HTMLInputElement;
const rateSelect = document.getElementById("rate-select") as HTMLSelectElement;
const volumeSlider = document.getElementById("volume-slider") as HTMLInputElement;

const audioFileInput = document.getElementById("audio-file") as HTMLInputElement;
const lyricFileInput = document.getElementById("lyric-file") as HTMLInputElement;
const audioInfo = document.getElementById("audio-info") as HTMLSpanElement;
const lyricInfo = document.getElementById("lyric-info") as HTMLSpanElement;
const btnReset = document.getElementById("btn-reset") as HTMLButtonElement;
const controlsContainer = document.getElementById("controls") as HTMLElement;

// ---- 性能顶栏元素 ----
const perfFpsDot = document.getElementById("perf-fps-dot") as HTMLSpanElement;
const perfFpsVal = document.getElementById("perf-fps-val") as HTMLSpanElement;
const perfFrametimeVal = document.getElementById("perf-frametime-val") as HTMLSpanElement;
const perfMemVal = document.getElementById("perf-mem-val") as HTMLSpanElement;
const perfDomVal = document.getElementById("perf-dom-val") as HTMLSpanElement;
const perfStatusVal = document.getElementById("perf-status-val") as HTMLSpanElement;

// ---- 状态与引擎 ----
const state: DemoState = loadState();
let currentLines: LyricLine[] = [];
let isDraggingSlider = false;

// 应用初始持久化的字体大小
if (state.fontSize) {
  container.style.fontSize = `${state.fontSize}px`;
}

const formatTime = (ms: number): string => {
  const safe = Math.max(0, ms);
  const sec = Math.floor(safe / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};

const player = new DemoPlayer(audio, (playing) => {
  playBtn.textContent = playing ? "暂停" : "播放";
  renderer.setPlaying(playing);
});

const renderer = new LyricRenderer(container, {
  playing: false,
  alignPosition: state.alignPosition,
  wordFadeWidth: state.wordFadeWidth,
  enableWordHighlight: state.enableWordHighlight,
  minInterludeGap: state.minInterludeGap,
  breatheCycleTarget: state.breatheCycleTarget,
  inactiveAlpha: state.inactiveAlpha,
  hidePassedLines: state.hidePassedLines,
  enableBlur: state.enableBlur,
  enableFloatAnimation: state.enableFloatAnimation,
  enableScale: state.enableScale,
  showTranslation: state.showTranslation,
  showRomanization: state.showRomanization,
  showWordRomanization: state.showWordRomanization,
  showRuby: state.showRuby,
  bgAlwaysBelow: state.bgAlwaysBelow,
  enableScrollPreroll: state.enableScrollPreroll,
  scrollResetDelay: state.scrollResetDelay,
  seekForwardThreshold: state.seekForwardThreshold,
  springConfig: {
    mass: state["spring.mass"],
    damping: state["spring.damping"],
    stiffness: state["spring.stiffness"],
    soft: state["spring.soft"],
  },
  onLineClick: (timeMs) => {
    if (player.hasAudio()) {
      player.seek(timeMs);
      if (!player.getIsPlaying()) void player.play();
    } else {
      renderer.setCurrentTime(timeMs);
    }
  },
});

// ---- 播放控制条事件 ----
playBtn.addEventListener("click", () => {
  player.togglePlay();
});

rateSelect.addEventListener("change", () => {
  player.setPlaybackRate(Number.parseFloat(rateSelect.value));
});

volumeSlider.addEventListener("input", () => {
  player.setVolume(Number.parseFloat(volumeSlider.value));
});

timeSlider.addEventListener("mousedown", () => {
  isDraggingSlider = true;
});

timeSlider.addEventListener(
  "touchstart",
  () => {
    isDraggingSlider = true;
  },
  { passive: true },
);

timeSlider.addEventListener("input", () => {
  const val = Number.parseFloat(timeSlider.value);
  timeLabel.textContent = `${formatTime(val)} / ${formatTime(player.getDuration())}`;
});

timeSlider.addEventListener("change", () => {
  isDraggingSlider = false;
  player.seek(Number.parseFloat(timeSlider.value));
});

// ---- 音频元数据监听 ----
audio.addEventListener("loadedmetadata", () => {
  const dur = player.getDuration();
  timeSlider.max = String(Math.round(dur));
  timeLabel.textContent = `0:00 / ${formatTime(dur)}`;
});

// ---- 媒体文件导入 ----
audioFileInput.addEventListener("change", () => {
  const file = audioFileInput.files?.[0];
  if (!file) return;
  player.loadAudio(file);
  playBtn.disabled = false;
  timeSlider.disabled = false;
  audioInfo.textContent = `音频：${file.name}`;
});

lyricFileInput.addEventListener("change", async () => {
  const file = lyricFileInput.files?.[0];
  if (!file) return;
  try {
    const loaded = await parseLyricFile(file);
    currentLines = loaded.lines;
    renderer.setLyrics(loaded.lines);
    emptyPlaceholder.style.display = "none";
    lyricInfo.textContent = `歌词：${loaded.title} (${loaded.lines.length} 行)`;
  } catch (err) {
    alert(`歌词解析失败: ${String(err)}`);
  }
});

// ---- 动画帧时钟循环与性能监控 ----
let perfFrameCount = 0;
let perfLastTime = performance.now();

const onFrame = () => {
  perfFrameCount++;
  const now = performance.now();
  const elapsed = now - perfLastTime;

  // 每 250ms 更新一次顶栏性能数据，保证流畅无卡顿且不增加渲染负荷
  if (elapsed >= 250) {
    const fps = Math.round((perfFrameCount * 1000) / elapsed);
    const avgFrameTime = (elapsed / perfFrameCount).toFixed(1);
    perfFrameCount = 0;
    perfLastTime = now;

    perfFpsVal.textContent = String(fps);
    perfFrametimeVal.textContent = `${avgFrameTime} ms`;

    // 帧率状态灯指示
    if (fps >= 55) {
      perfFpsDot.className = "perf-dot";
    } else if (fps >= 30) {
      perfFpsDot.className = "perf-dot warn";
    } else {
      perfFpsDot.className = "perf-dot alert";
    }

    perfDomVal.textContent = `${currentLines.length} 行`;
    const isPlaying = player.getIsPlaying();
    perfStatusVal.textContent = isPlaying ? "播放中" : "已暂停";
    perfStatusVal.style.color = isPlaying ? "#22c55e" : "#a1a1aa";

    // 内存统计 (Chromium performance.memory API)
    const perfWithMemory = performance as unknown as {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
    };
    if (perfWithMemory.memory) {
      const usedMB = (perfWithMemory.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      const totalMB = (perfWithMemory.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1);
      perfMemVal.textContent = `${usedMB} / ${totalMB} MB`;
    } else {
      perfMemVal.textContent = "未开放";
    }
  }

  if (player.hasAudio()) {
    const current = player.getCurrentTime();
    const duration = player.getDuration();
    renderer.setCurrentTime(current);

    if (!isDraggingSlider) {
      if (duration > 0) {
        timeSlider.max = String(Math.round(duration));
      }
      timeSlider.value = String(Math.round(current));
      timeLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    }
  }

  requestAnimationFrame(onFrame);
};

requestAnimationFrame(onFrame);

// ---- 参数控制面板与持久化 ----
const handlePanelChange = (key: keyof DemoState & string) => {
  saveState(state);

  if (key === "fontSize") {
    container.style.fontSize = `${state.fontSize}px`;
    return;
  }

  if (key === "springPreset") {
    if (state.springPreset !== "custom") {
      const preset = SPRING_PRESETS[state.springPreset as Exclude<SpringPreset, "custom">];
      if (preset) {
        state["spring.mass"] = preset.mass;
        state["spring.damping"] = preset.damping;
        state["spring.stiffness"] = preset.stiffness;
        renderer.setConfig({
          springConfig: {
            mass: preset.mass,
            damping: preset.damping,
            stiffness: preset.stiffness,
            soft: state["spring.soft"],
          },
        });
        saveState(state);
        buildPanel(controlsContainer, state, CONTROL_DEFS, handlePanelChange);
        return;
      }
    }
    return;
  }

  if (key.startsWith("spring.")) {
    if (key !== "spring.soft") {
      let matchedPreset: SpringPreset = "custom";
      for (const [pName, pVal] of Object.entries(SPRING_PRESETS)) {
        if (
          Math.abs(pVal.mass - state["spring.mass"]) < 0.001 &&
          Math.abs(pVal.damping - state["spring.damping"]) < 0.001 &&
          Math.abs(pVal.stiffness - state["spring.stiffness"]) < 0.001
        ) {
          matchedPreset = pName as SpringPreset;
          break;
        }
      }
      if (state.springPreset !== matchedPreset) {
        state.springPreset = matchedPreset;
        const presetSelect = controlsContainer.querySelector(
          "select.ctl-select",
        ) as HTMLSelectElement | null;
        if (presetSelect) presetSelect.value = matchedPreset;
      }
    }

    renderer.setConfig({
      springConfig: {
        mass: state["spring.mass"],
        damping: state["spring.damping"],
        stiffness: state["spring.stiffness"],
        soft: state["spring.soft"],
      },
    });
    return;
  }
  renderer.setConfig({ [key]: state[key] });
};

// ---- 重置配置 ----
btnReset?.addEventListener("click", () => {
  clearSavedState();
  const fresh = createInitialState();
  Object.assign(state, fresh);
  container.style.fontSize = `${state.fontSize}px`;

  renderer.setConfig({
    alignPosition: state.alignPosition,
    wordFadeWidth: state.wordFadeWidth,
    enableWordHighlight: state.enableWordHighlight,
    minInterludeGap: state.minInterludeGap,
    breatheCycleTarget: state.breatheCycleTarget,
    inactiveAlpha: state.inactiveAlpha,
    hidePassedLines: state.hidePassedLines,
    enableBlur: state.enableBlur,
    enableFloatAnimation: state.enableFloatAnimation,
    showTranslation: state.showTranslation,
    showRomanization: state.showRomanization,
    showWordRomanization: state.showWordRomanization,
    showRuby: state.showRuby,
    bgAlwaysBelow: state.bgAlwaysBelow,
    enableScrollPreroll: state.enableScrollPreroll,
    scrollResetDelay: state.scrollResetDelay,
    seekForwardThreshold: state.seekForwardThreshold,
    springConfig: {
      mass: state["spring.mass"],
      damping: state["spring.damping"],
      stiffness: state["spring.stiffness"],
      soft: state["spring.soft"],
    },
  });

  buildPanel(controlsContainer, state, CONTROL_DEFS, handlePanelChange);
});

buildPanel(controlsContainer, state, CONTROL_DEFS, handlePanelChange);
