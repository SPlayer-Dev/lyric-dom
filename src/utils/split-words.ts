import type { LyricWord } from "../types";

const CJK_RE = /^[\p{Unified_Ideograph}぀-ヿ]+$/u;

/**
 * 判断字符串是否全部为 CJK（中日韩统一表意文字）
 * @param char - 待判断字符串
 * @returns 是否全部为 CJK
 */
export const isCJK = (char: string): boolean => CJK_RE.test(char);

const hasSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter !== "undefined";

/** 词边界分词器单例 */
let wordSegmenter: Intl.Segmenter | undefined;

/**
 * 根据时间比例创建一个歌词原子
 * @param word - 文字内容
 * @param romanWord - 罗马音/拼音
 * @param obscene - 是否为脏话
 * @param startTime - 起始时间
 * @param endTime - 结束时间
 * @param emptyBeat - 空拍数量
 */
const makeAtom = (
  word: string,
  romanWord: string,
  obscene: boolean,
  startTime: number,
  endTime: number,
  emptyBeat?: number,
): LyricWord => ({
  word,
  romanWord,
  startTime,
  endTime,
  obscene,
  ...(emptyBeat !== undefined ? { emptyBeat } : {}),
});

/**
 * 将歌词单词重新分组：CJK 字符逐字拆分，并通过 Intl.Segmenter 按语言词边界合并
 * @param words - 原始歌词单词数组
 * @returns 分组后的单词或单词组数组
 */
export const chunkAndSplitLyricWords = (words: LyricWord[]): (LyricWord | LyricWord[])[] => {
  const atoms: LyricWord[] = [];

  for (const w of words) {
    const content = w.word.trim();
    const romanWord = w.romanWord ?? "";
    const obscene = w.obscene ?? false;
    const emptyBeat = w.emptyBeat;

    // 空白或含 ruby 注音的单词直接保留
    if (content.length === 0 || (w.ruby?.length ?? 0) > 0) {
      atoms.push({ ...w });
      continue;
    }

    const parts = w.word.split(/(\s+)/).filter((p) => p.length > 0);
    const totalLen = w.word.replace(/\s/g, "").length || 1;
    const duration = w.endTime - w.startTime;
    let offset = 0;

    for (let pIdx = 0; pIdx < parts.length; pIdx++) {
      const part = parts[pIdx];
      if (!part.trim()) {
        const t = w.startTime + (offset / totalLen) * duration;
        atoms.push(makeAtom(part, "", obscene, t, t, emptyBeat));
        continue;
      }

      if (isCJK(part) && part.length > 1 && romanWord.trim().length === 0) {
        // CJK 多字词逐字拆分，均分时间
        const charDur = duration / totalLen;
        for (let cIdx = 0; cIdx < part.length; cIdx++) {
          const char = part[cIdx];
          const t = w.startTime + (offset / totalLen) * duration;
          atoms.push(makeAtom(char, "", obscene, t, t + charDur, emptyBeat));
          offset++;
        }
      } else {
        const t = w.startTime + (offset / totalLen) * duration;
        const partDur = (part.length / totalLen) * duration;
        atoms.push(makeAtom(part, romanWord, obscene, t, t + partDur, emptyBeat));
        offset += part.length;
      }
    }
  }

  if (!hasSegmenter) return atoms;

  // 按词边界（空格或空白）切分为独立的连续字块，避免跨空格合并西文单词
  const runs: LyricWord[][] = [];
  let currentRun: LyricWord[] = [];

  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    currentRun.push(atom);
    if (i === atoms.length - 1 || hasWordBoundaryBetween(atom, atoms[i + 1])) {
      runs.push(currentRun);
      currentRun = [];
    }
  }

  wordSegmenter ??= new Intl.Segmenter(undefined, { granularity: "word" });
  const result: (LyricWord | LyricWord[])[] = [];

  for (const run of runs) {
    if (run.length === 1) {
      result.push(run[0]);
    } else {
      result.push(...groupAtomsBySegmenter(run, wordSegmenter));
    }
  }

  return result;
};

/**
 * 判断两个相邻原子之间是否存在天然词边界
 * @param current - 当前原子
 * @param next - 下一个原子
 * @returns 是否存在边界
 */
const hasWordBoundaryBetween = (current: LyricWord, next?: LyricWord): boolean => {
  if (/\s$/.test(current.word) || !current.word.trim()) {
    return true;
  }
  if (next && (/^\s/.test(next.word) || !next.word.trim())) {
    return true;
  }
  return false;
};

/**
 * 在无空格的连续原子序列上应用分词器按词边界重新分组
 * @param atoms - 连续原子数组
 * @param segmenter - 分词器实例
 * @returns 分组后的单词或单词组数组
 */
const groupAtomsBySegmenter = (
  atoms: LyricWord[],
  segmenter: Intl.Segmenter,
): (LyricWord | LyricWord[])[] => {
  const fullText = atoms.map((a) => a.word).join("");
  const segments = segmenter.segment(fullText);
  const result: (LyricWord | LyricWord[])[] = [];
  let atomIdx = 0;
  let actual = 0;
  let expected = 0;
  let group: LyricWord[] = [];

  for (const seg of segments) {
    expected += seg.segment.length;

    while (actual < expected && atomIdx < atoms.length) {
      const atom = atoms[atomIdx++];
      group.push(atom);
      actual += atom.word.length;
    }

    if (actual === expected) {
      while (group.length > 1 && !group[0].word.trim()) {
        const leading = group.shift();
        if (leading) result.push(leading);
      }
      result.push(group.length === 1 ? group[0] : group);
      group = [];
    }
  }

  while (atomIdx < atoms.length) {
    result.push(atoms[atomIdx++]);
  }
  if (group.length > 0) {
    result.push(group.length === 1 ? group[0] : group);
  }

  return result;
};

/** 匹配字母或数字字符（Unicode 全语言支持） */
const LETTER_OR_DIGIT_RE = /[\p{L}\p{N}]/u;

/**
 * 判断两个相邻文本之间是否需要插入空格
 * CJK 字符之间不需要空格，非 CJK 的字母/数字之间需要空格
 * @param prevText - 前一个文本
 * @param nextText - 后一个文本
 * @returns 是否需要空格
 */
export const needsSpaceBetween = (prevText: string, nextText: string): boolean => {
  if (!prevText || !nextText) return false;
  const lastChar = prevText[prevText.length - 1];
  const firstChar = nextText[0];
  if (isCJK(lastChar) || isCJK(firstChar)) return false;
  return LETTER_OR_DIGIT_RE.test(lastChar) && LETTER_OR_DIGIT_RE.test(firstChar);
};
