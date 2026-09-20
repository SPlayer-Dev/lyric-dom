/** 单词 span 构建与掩码测量 */

import type { LyricLine, LyricSpan, LyricWord, WordAnimTarget, WordMeasurement } from "../types";
import { chunkAndSplitLyricWords, needsSpaceBetween } from "../utils/split-words";
import { shouldChunkEmphasize } from "./emphasize";

export type { WordAnimTarget, WordMeasurement };

/** buildWordSpans 返回结果 */
export interface BuildResult {
  measurements: WordMeasurement[];
  animTargets: WordAnimTarget[];
}

/** 单词构建选项 */
export interface WordBuildOptions {
  /** 是否启用强调效果 */
  enableEmphasizeEffect: boolean;
  /** 触发强调效果的最小持续时间（毫秒） */
  emphasizeMinDuration: number;
  /** 是否显示词内注音 */
  showRuby: boolean;
  /** 是否显示逐字音译 */
  showWordRoman?: boolean;
}

/**
 * 构建单词 span 元素并添加到主容器
 * @param words - 歌词单词数组
 * @param mainDiv - 挂载目标容器
 * @param options - 单词构建选项
 * @returns 测量数据与动画目标
 */
export const buildWordSpans = (
  words: LyricWord[],
  mainDiv: HTMLDivElement,
  options: WordBuildOptions,
): BuildResult => {
  const {
    enableEmphasizeEffect: enableEmphasize,
    emphasizeMinDuration,
    showRuby,
    showWordRoman = false,
  } = options;
  const chunks = chunkAndSplitLyricWords(words);
  const measurements: WordMeasurement[] = [];
  const animTargets: WordAnimTarget[] = [];

  const hasWhitespaceInfo = chunks.some((chunk) => {
    if (Array.isArray(chunk)) {
      return chunk.some((word) => word.word !== word.word.trim());
    }
    return chunk.word !== chunk.word.trim();
  });

  const nonEmptyChunks: (LyricWord | LyricWord[])[] = chunks.filter((c) =>
    Array.isArray(c) ? c.some((w) => w.word.trim()) : c.word.trim(),
  );
  const lastChunk = nonEmptyChunks[nonEmptyChunks.length - 1];

  if (!hasWhitespaceInfo) {
    let previousText = "";
    for (const chunk of chunks) {
      const atoms = Array.isArray(chunk) ? chunk : [chunk];
      const isEmp =
        enableEmphasize && atoms.length > 0 && shouldChunkEmphasize(atoms, emphasizeMinDuration);
      const isLast = chunk === lastChunk;

      const firstText = atoms[0]?.word.trim();
      if (firstText && needsSpaceBetween(previousText, firstText)) {
        mainDiv.appendChild(document.createTextNode(" "));
      }

      if (isEmp) {
        buildEmphasizedChunk(atoms, mainDiv, measurements, animTargets, isLast, showWordRoman);
      } else {
        for (const atom of atoms) {
          const text = atom.word.trim();
          if (!text) continue;
          appendWordSpan(atom, mainDiv, measurements, animTargets, showRuby, showWordRoman);
        }
      }
      const lastAtom = atoms[atoms.length - 1];
      if (lastAtom) previousText = lastAtom.word.trim();
    }
    return { measurements, animTargets };
  }

  // 正常路径（歌词文本中包含显式空格）
  let previousText = "";

  for (const chunk of chunks) {
    if (Array.isArray(chunk)) {
      const mergedText = chunk.map((word) => word.word).join("");
      const isEmp = enableEmphasize && shouldChunkEmphasize(chunk, emphasizeMinDuration);
      const isLast = chunk === lastChunk;

      if (mergedText.trimStart() !== mergedText) {
        mainDiv.appendChild(document.createTextNode(" "));
      } else if (needsSpaceBetween(previousText, mergedText)) {
        mainDiv.appendChild(document.createTextNode(" "));
      }

      if (isEmp) {
        buildEmphasizedChunk(chunk, mainDiv, measurements, animTargets, isLast, showWordRoman);
      } else {
        for (let wIdx = 0; wIdx < chunk.length; wIdx++) {
          const word = chunk[wIdx];
          appendWordSpan(word, mainDiv, measurements, animTargets, showRuby, showWordRoman);
        }
      }

      if (mergedText.trimEnd() !== mergedText) {
        mainDiv.appendChild(document.createTextNode(" "));
        previousText = "";
      } else {
        previousText = mergedText;
      }
    } else if (!chunk.word.trim()) {
      mainDiv.appendChild(document.createTextNode(" "));
      previousText = "";
    } else {
      const text = chunk.word;
      const isEmp = enableEmphasize && shouldChunkEmphasize([chunk], emphasizeMinDuration);
      const isLast = chunk === lastChunk;

      if (text.trimStart() !== text) {
        mainDiv.appendChild(document.createTextNode(" "));
      } else if (needsSpaceBetween(previousText, text)) {
        mainDiv.appendChild(document.createTextNode(" "));
      }

      if (isEmp) {
        buildEmphasizedChunk([chunk], mainDiv, measurements, animTargets, isLast, showWordRoman);
      } else {
        appendWordSpan(chunk, mainDiv, measurements, animTargets, showRuby, showWordRoman);
      }

      if (text.trimEnd() !== text) {
        mainDiv.appendChild(document.createTextNode(" "));
        previousText = "";
      } else {
        previousText = text.trim();
      }
    }
  }
  return { measurements, animTargets };
};

/**
 * 创建普通单词 span（含 ruby 注音与逐字音译）并挂载
 * @param word - 单词数据
 * @param mainDiv - 挂载目标容器
 * @param measurements - 测量数据输出数组
 * @param animTargets - 动画目标输出数组
 * @param showRuby - 是否渲染注音
 * @param showWordRoman - 是否渲染逐字音译
 */
const appendWordSpan = (
  word: LyricWord,
  mainDiv: HTMLDivElement,
  measurements: WordMeasurement[],
  animTargets: WordAnimTarget[],
  showRuby: boolean,
  showWordRoman: boolean,
) => {
  const span = document.createElement("span");
  const ruby = showRuby ? word.ruby : undefined;

  if (showWordRoman) {
    span.className = "lp-word-roman";

    const textEl = document.createElement("span");
    textEl.className = "lp-word-text";
    if (ruby?.length) {
      buildRubyContent(textEl, word.word, ruby);
    } else {
      textEl.textContent = word.word;
    }
    span.appendChild(textEl);

    const romanEl = document.createElement("span");
    romanEl.className = "lp-roman-word";
    const romanText = word.romanWord?.trim();
    romanEl.textContent = romanText && romanText.length > 0 ? romanText : "\u00A0";
    span.appendChild(romanEl);
  } else {
    if (ruby?.length) {
      buildRubyContent(span, word.word, ruby);
    } else {
      span.textContent = word.word;
    }
  }

  mainDiv.appendChild(span);
  measurements.push({ element: span, word, width: 0, fadeWidth: 0 });
  animTargets.push({
    element: span,
    word,
    isEmphasize: false,
    charElements: [],
    isLastWord: false,
  });
};

/**
 * 构建注音内容
 * ruby 片段数与词字符数一致时逐字配对，否则整词标注
 * @param span - 注音挂载的单词 span
 * @param text - 单词文本
 * @param ruby - 注音片段列表
 */
const buildRubyContent = (span: HTMLSpanElement, text: string, ruby: LyricSpan[]) => {
  const chars = Array.from(text);
  const validRuby = ruby.filter((r) => r.word.trim());
  if (validRuby.length === chars.length) {
    for (let i = 0; i < chars.length; i++) {
      const rubyEl = document.createElement("ruby");
      rubyEl.textContent = chars[i];
      const rt = document.createElement("rt");
      rt.textContent = validRuby[i].word;
      rubyEl.appendChild(rt);
      span.appendChild(rubyEl);
    }
  } else {
    const rubyEl = document.createElement("ruby");
    rubyEl.textContent = text;
    const rt = document.createElement("rt");
    rt.textContent = validRuby.map((r) => r.word).join("");
    rubyEl.appendChild(rt);
    span.appendChild(rubyEl);
  }
};

/**
 * 构建强调单词 chunk
 * @param atoms - 合并前的同组单词
 * @param mainDiv - 挂载目标容器
 * @param measurements - 测量数据输出数组
 * @param animTargets - 动画目标输出数组
 * @param isLastWord - 是否为行末单词
 * @param showWordRoman - 是否渲染逐字音译
 */
const buildEmphasizedChunk = (
  atoms: LyricWord[],
  mainDiv: HTMLDivElement,
  measurements: WordMeasurement[],
  animTargets: WordAnimTarget[],
  isLastWord: boolean,
  showWordRoman: boolean,
) => {
  const mergedWord: LyricWord = {
    word: atoms.map((a) => a.word).join(""),
    startTime: Math.min(...atoms.map((a) => a.startTime)),
    endTime: Math.max(...atoms.map((a) => a.endTime)),
  };
  const trimmed = mergedWord.word.trim();

  const wrapper = document.createElement("span");
  wrapper.className = "lp-emp-wrapper";

  const charElements: HTMLElement[] = [];
  if (showWordRoman) {
    wrapper.classList.add("lp-word-roman");

    const charsContainer = document.createElement("span");
    charsContainer.className = "lp-emp-chars";
    for (const char of trimmed) {
      const charSpan = document.createElement("span");
      charSpan.className = "lp-emp-char";
      charSpan.textContent = char;
      charsContainer.appendChild(charSpan);
      charElements.push(charSpan);
    }
    wrapper.appendChild(charsContainer);

    const romanEl = document.createElement("span");
    romanEl.className = "lp-roman-word";
    const romanParts = atoms.map((a) => a.romanWord?.trim()).filter(Boolean);
    const romanText = romanParts.length > 0 ? romanParts.join(" ") : "";
    romanEl.textContent = romanText.length > 0 ? romanText : "\u00A0";
    wrapper.appendChild(romanEl);
  } else {
    for (const char of trimmed) {
      const charSpan = document.createElement("span");
      charSpan.className = "lp-emp-char";
      charSpan.textContent = char;
      wrapper.appendChild(charSpan);
      charElements.push(charSpan);
    }
  }

  mainDiv.appendChild(wrapper);
  measurements.push({ element: wrapper, word: mergedWord, width: 0, fadeWidth: 0 });
  animTargets.push({
    element: wrapper,
    word: mergedWord,
    isEmphasize: true,
    charElements,
    isLastWord,
  });
};

/**
 * 测量所有单词的宽度并设置 CSS 掩码
 * 采用读写分离策略：第一遍批量读取所有 DOM 尺寸（触发一次回流），
 * 第二遍批量写入所有 CSS mask 样式（零回流），避免逐词读写交替导致的 N 次强制回流
 * @param wordMeasurements - 每行的单词测量数据
 * @param fadeRatio - 渐变区域宽度比例
 * @param lines - 歌词行数组，提供行起始时间
 */
export const measureAndApplyWordMasks = (
  wordMeasurements: WordMeasurement[][],
  fadeRatio: number,
  lines?: LyricLine[],
) => {
  // 临时存储每个 measurement 的 padding，供第二遍使用
  const paddings: number[][] = new Array(wordMeasurements.length);

  // 批量读取 DOM 尺寸（合并回流）
  for (let i = 0; i < wordMeasurements.length; i++) {
    const lineMeasurements = wordMeasurements[i];
    if (!lineMeasurements) {
      paddings[i] = [];
      continue;
    }
    paddings[i] = new Array(lineMeasurements.length);
    for (let j = 0; j < lineMeasurements.length; j++) {
      const m = lineMeasurements[j];
      const el = m.element;
      const padding = el.classList.contains("lp-emp-wrapper")
        ? Number.parseFloat(getComputedStyle(el).paddingLeft) || 0
        : 0;
      paddings[i][j] = padding;
      m.width = (el.clientWidth || 1) - padding * 2;
      m.fadeWidth = ((el.clientHeight || 16) - padding * 2) * fadeRatio;
    }
  }

  // 批量写入 CSS mask 样式
  for (let i = 0; i < wordMeasurements.length; i++) {
    const lineMeasurements = wordMeasurements[i];
    const lineStart = lines?.[i]?.startTime ?? 0;
    if (!lineMeasurements) continue;
    for (let j = 0; j < lineMeasurements.length; j++) {
      const measurement = lineMeasurements[j];
      const padding = paddings[i][j];
      const elementWidth = measurement.width;
      const gradientWidth = measurement.fadeWidth;
      const totalAspect = 2 + gradientWidth / elementWidth;
      const gradientRatio = gradientWidth / elementWidth / totalAspect;
      const gradientStart = (1 - gradientRatio) / 2;
      const maskImage = `linear-gradient(to right,rgba(0,0,0,var(--ba)) ${gradientStart * 100}%,rgba(0,0,0,var(--da)) ${(gradientStart + gradientRatio) * 100}%)`;
      const maskPixelWidth = totalAspect * elementWidth;
      const maskSize = `${maskPixelWidth}px 100%`;
      const wordData = measurement.word;
      const totalMaskWidth = elementWidth + gradientWidth;
      const wordDuration = Math.abs(wordData.endTime - wordData.startTime) || 1;
      // preRoll：在 startTime 之前提前开始扫动，让相邻词亮区衔接而非硬切
      const preRoll = Math.min(80, wordDuration * 0.3);
      const adjustedStart = Math.min(
        wordData.startTime,
        Math.max(lineStart, wordData.startTime - preRoll),
      );
      const adjustedDuration = Math.max(1, wordData.endTime - adjustedStart);
      const startPos = padding - totalMaskWidth;
      const endPos = padding;
      const speed = totalMaskWidth / adjustedDuration;
      const maskPosition = Number.isFinite(speed)
        ? `clamp(${startPos}px,calc(${startPos}px + (var(--t,${lineStart}) - ${adjustedStart}) * ${speed}px),${endPos}px) 0px,left top`
        : `${startPos}px 0px,left top`;
      const style = measurement.element.style;
      style.setProperty("-webkit-mask-image", maskImage);
      style.setProperty("-webkit-mask-size", maskSize);
      style.setProperty("-webkit-mask-repeat", "no-repeat");
      style.setProperty("-webkit-mask-position", maskPosition);
      style.removeProperty("-webkit-mask-composite");
      style.setProperty("mask-image", maskImage);
      style.setProperty("mask-size", maskSize);
      style.setProperty("mask-repeat", "no-repeat");
      style.setProperty("mask-position", maskPosition);
      style.removeProperty("mask-composite");
    }
  }
};
