/**
 * 词内注音的宽度回收与碰撞撑开
 * 回收让主歌词字距保持紧凑，相撞的假名按实测几何退回撑开排版
 */
import type { WordMeasurement } from "../types";

/** 相邻假名之间保留的最小间距（像素） */
const MIN_GAP = 0.5;

/** 碰撞撑开的最大轮次，撑开引发的重新换行需额外轮次复核 */
const MAX_PASSES = 3;

/** 注音假名的占位区间 */
export interface RubyBand {
  /** 左边界 */
  left: number;
  /** 右边界 */
  right: number;
  /** 上边界 */
  top: number;
  /** 下边界 */
  bottom: number;
}

/** 注音单词的排版状态 */
interface RubyWord {
  /** 单词 span 元素 */
  element: HTMLSpanElement;
  /** 词内假名元素 */
  annotations: HTMLElement[];
  /** 假名挤占主歌词的行内宽度 */
  overflow: number;
  /** 是否已取消回收，退回注音撑开间距的自然排版 */
  expanded: boolean;
}

/**
 * 找出与其它占位相交的占位下标，占位需按 left 升序传入
 * @param bands - 同一行内的注音假名占位区间
 * @returns 发生碰撞的占位下标
 */
export const findRubyCollisions = (bands: RubyBand[]) => {
  const collided = new Set<number>();
  for (let i = 0; i < bands.length; i++) {
    const current = bands[i];
    // 已按 left 升序，首个不再横向交叠的占位之后都不会与当前相交
    for (let j = i + 1; j < bands.length && bands[j].left < current.right - MIN_GAP; j++) {
      if (current.top < bands[j].bottom && bands[j].top < current.bottom) {
        collided.add(i);
        collided.add(j);
      }
    }
  }
  return collided;
};

/**
 * 写出单词的回收量，已撑开的单词回收量归零
 * @param word - 注音单词
 */
const writeReclaim = (word: RubyWord) => {
  const overflow = word.expanded ? 0 : word.overflow;
  word.element.style.setProperty("--lp-ruby-overflow", `${overflow.toFixed(2)}px`);
};

/**
 * 合并词内假名的实测占位区间
 * @param word - 注音单词
 * @returns 占位区间，量不到有效尺寸（如未挂载）时为 undefined
 */
const readBand = (word: RubyWord): RubyBand | undefined => {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rt of word.annotations) {
    const rect = rt.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (left >= right || top >= bottom) return undefined;
  return { left, right, top, bottom };
};

/**
 * 收集每行的注音单词
 * @param wordMeasurements - 每行的单词测量数据
 */
const collectRubyWords = (wordMeasurements: WordMeasurement[][]) => {
  const lines: RubyWord[][] = [];
  for (let i = 0; i < wordMeasurements.length; i++) {
    const lineMeasurements = wordMeasurements[i];
    if (!lineMeasurements) continue;
    const words: RubyWord[] = [];
    for (const m of lineMeasurements) {
      if (!m.element.classList.contains("lp-ruby-word")) continue;
      words.push({
        element: m.element,
        annotations: Array.from(m.element.querySelectorAll<HTMLElement>("rt")),
        overflow: 0,
        expanded: false,
      });
    }
    if (words.length > 0) lines.push(words);
  }
  return lines;
};

/**
 * 逐轮量测并撑开相撞的注音单词
 * 撑开只会把同行后续内容推远，因此逐轮复核即可收敛
 * @param lines - 每行的注音单词
 */
const expandCollided = (lines: RubyWord[][]) => {
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const collided = new Set<RubyWord>();
    for (const words of lines) {
      if (words.length < 2) continue;
      const entries: { band: RubyBand; word: RubyWord }[] = [];
      for (const word of words) {
        const band = readBand(word);
        if (band) entries.push({ band, word });
      }
      entries.sort((a, b) => a.band.left - b.band.left);
      for (const index of findRubyCollisions(entries.map((entry) => entry.band))) {
        collided.add(entries[index].word);
      }
    }

    let changed = false;
    for (const word of collided) {
      if (word.expanded || word.overflow <= 0) continue;
      word.expanded = true;
      writeReclaim(word);
      changed = true;
    }
    if (!changed) return;
  }
};

/**
 * 回收词内注音挤占主歌词的行内宽度，并把相撞的假名退回撑开排版
 * @param wordMeasurements - 每行的单词测量数据
 */
export const applyRubySpacing = (wordMeasurements: WordMeasurement[][]) => {
  const lines = collectRubyWords(wordMeasurements);
  const words = lines.flat();
  if (words.length === 0) return;

  const annotations = words.flatMap((word) => word.annotations);
  // 隐藏假名与还原后各量一次盒宽，差值即假名挤占主歌词的行内宽度
  for (const rt of annotations) rt.style.setProperty("display", "none");
  const textWidths = words.map((word) => word.element.clientWidth);
  for (const rt of annotations) rt.style.removeProperty("display");
  const boxWidths = words.map((word) => word.element.clientWidth);
  // 批量写入后再统一量测碰撞，避免读写交替引发多次回流
  words.forEach((word, i) => {
    word.overflow = Math.max(0, boxWidths[i] - textWidths[i]);
    writeReclaim(word);
  });

  expandCollided(lines);
};
