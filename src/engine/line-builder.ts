/**
 * 歌词渲染引擎 — 歌词行 DOM 构建
 * 主行是唯一排版单元；背景行收进其主行的 `.lp-line` 内做绝对定位浮层，
 * 二者在几何上“一体”：背景行不再作为独立歌词行参与列排布。
 */

import type { LyricLine } from "../types";
import {
  buildWordSpans,
  type WordAnimTarget,
  type WordBuildOptions,
  type WordMeasurement,
} from "./word-builder";

/** 行 DOM 构建选项 */
export interface LineBuildOptions extends WordBuildOptions {
  /** 是否显示翻译歌词 */
  showTranslation: boolean;
  /** 是否显示音译歌词 */
  showRomanization: boolean;
  /** 是否显示逐字音译 */
  showWordRomanization: boolean;
  /** 是否始终将背景行置于主行下方 */
  bgAlwaysBelow: boolean;
}

/** 行 DOM 构建结果 */
export interface LineBuildResult {
  /** 每行元素：主行是其 `.lp-line`，背景行是主行内部的 `.lp-line-bg` 浮层 */
  lineElements: HTMLDivElement[];
  wordMeasurements: WordMeasurement[][];
  lineAnimTargets: WordAnimTarget[][];
  /** 背景行是否应置于主行上方 */
  isBgAbove: boolean[];
  fragment: DocumentFragment;
}

/** 构建单个 `.lp-main` 单词层并回填测量/动画目标 */
const buildMainLayer = (
  line: LyricLine,
  mainDiv: HTMLDivElement,
  options: LineBuildOptions,
  isStatic: boolean,
  showWordRoman: boolean,
): { measurements: WordMeasurement[]; animTargets: WordAnimTarget[] } => {
  if (isStatic) {
    mainDiv.appendChild(document.createTextNode(line.words.map((w) => w.word).join("")));
    // 静态行也加统一 mask，让 --ba 对其生效，与逐字行透明度一致
    mainDiv.style.setProperty(
      "mask-image",
      "linear-gradient(rgba(0,0,0,var(--ba)),rgba(0,0,0,var(--ba)))",
    );
    return { measurements: [], animTargets: [] };
  }
  const result = buildWordSpans(line.words, mainDiv, {
    showRuby: options.showRuby,
    showWordRoman,
  });
  return { measurements: result.measurements, animTargets: result.animTargets };
};

/** 追加 `.lp-sub` 副文本（翻译 / 音译） */
const appendSubs = (
  container: HTMLElement,
  line: LyricLine,
  options: LineBuildOptions,
  showLineRoman: boolean,
) => {
  if (options.showTranslation && line.translatedLyric) {
    const subDiv = document.createElement("div");
    subDiv.className = "lp-sub";
    subDiv.textContent = line.translatedLyric;
    container.appendChild(subDiv);
  }
  if (showLineRoman) {
    const subDiv = document.createElement("div");
    subDiv.className = "lp-sub";
    subDiv.textContent = line.romanLyric;
    container.appendChild(subDiv);
  }
};

/**
 * 构建全部歌词行的 DOM 元素与关联元数据
 * @param lines - 歌词行数组（背景行紧随其主行）
 * @param options - 构建选项
 * @returns 行元素、测量数据、动画目标与置顶背景行标记
 */
export const buildLineElements = (
  lines: LyricLine[],
  options: LineBuildOptions,
): LineBuildResult => {
  const lineCount = lines.length;
  const lineElements: HTMLDivElement[] = new Array(lineCount);
  const wordMeasurements: WordMeasurement[][] = new Array(lineCount);
  const lineAnimTargets: WordAnimTarget[][] = new Array(lineCount);
  const isBgAbove: boolean[] = new Array(lineCount).fill(false);

  // 是否视为逐字
  const hasMultiWordLine = lines.some((line) => line.words.length > 1);

  // 背景人声行：首词早于主行则置于主行上方，强制下置时忽略该判定
  for (let i = 1; i < lineCount; i++) {
    const bg = lines[i];
    const main = lines[i - 1];
    if (!bg?.isBG || main?.isBG) continue;
    const bgStart = bg.words[0]?.startTime ?? bg.startTime;
    const mainStart = main.words[0]?.startTime ?? main.startTime;
    isBgAbove[i] = !options.bgAlwaysBelow && bgStart < mainStart;
  }

  const fragment = document.createDocumentFragment();
  // 最近一个主行元素，用于收纳后续背景行
  let hostingMain: HTMLDivElement | null = null;

  for (let i = 0; i < lineCount; i++) {
    const line = lines[i];
    if (!line) continue;

    // 逐字音译 / 行音译 判定（背景行共用同一套规则）
    const hasWordRoman = line.words.some((w) => Boolean(w.romanWord?.trim()));
    const showWordRomanForLine = options.showWordRomanization && hasWordRoman;
    const showLineRomanForLine =
      options.showRomanization && Boolean(line.romanLyric) && !showWordRomanForLine;
    const isStatic =
      (line.words.length === 0 || (line.words.length === 1 && !hasMultiWordLine)) &&
      !showWordRomanForLine &&
      !(options.showRuby && line.words[0]?.ruby?.length);

    // 主行
    if (!line.isBG || !hostingMain) {
      const lineEl = document.createElement("div");
      lineEl.className = `lp-line${line.isDuet ? " duet" : ""}`;

      const mainDiv = document.createElement("div");
      mainDiv.className = "lp-main";
      // 设置 lang 便于浏览器选择正确字体与排版
      if (line.language) mainDiv.lang = line.language;

      const built = buildMainLayer(line, mainDiv, options, isStatic, showWordRomanForLine);
      wordMeasurements[i] = built.measurements;
      lineAnimTargets[i] = built.animTargets;

      // 内容包裹层
      const contentDiv = document.createElement("div");
      contentDiv.className = "lp-content";
      contentDiv.appendChild(mainDiv);
      appendSubs(contentDiv, line, options, showLineRomanForLine);

      lineEl.appendChild(contentDiv);
      lineElements[i] = lineEl;
      fragment.appendChild(lineEl);
      hostingMain = lineEl;
      continue;
    }

    // 背景行
    const bgEl = document.createElement("div");
    bgEl.className = `lp-line-bg${isBgAbove[i] ? " above" : ""}${line.isDuet ? " duet" : ""}`;

    const bgMainDiv = document.createElement("div");
    bgMainDiv.className = "lp-main";
    if (line.language) bgMainDiv.lang = line.language;

    const built = buildMainLayer(line, bgMainDiv, options, isStatic, showWordRomanForLine);
    wordMeasurements[i] = built.measurements;
    lineAnimTargets[i] = built.animTargets;
    bgEl.appendChild(bgMainDiv);
    appendSubs(bgEl, line, options, showLineRomanForLine);

    hostingMain.classList.add("has-bg");
    hostingMain.appendChild(bgEl);
    lineElements[i] = bgEl;
  }

  return { lineElements, wordMeasurements, lineAnimTargets, isBgAbove, fragment };
};
