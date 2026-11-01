/** 词内注音的悬挂判定与回收量估算 */

import type { LyricWord } from "../types";

/** renderer.css 中注音相对单词的字号比例 */
const RUBY_SIZE_RATIO = 0.5;

/** 平假名、片假名与長音符，即 §4067 的 cl-10、cl-11、cl-15、cl-16 */
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}\u30FC\uFF70]+$/u;

/** 假名与汉字，字体中均按全角计宽，据此可由字符数估算盒宽 */
const FULL_WIDTH_ONLY =
  /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Unified_Ideograph}\u30FC\uFF70]+$/u;

/** 按渲染顺序展开的判定单元 */
interface RubyAtom {
  word: LyricWord;
  text: string;
  rubyText: string;
}

/**
 * 判断相邻字符能否承接悬挂过来的假名
 *
 * §4067 允许注音悬挂到平假名、片假名、長音符与促音拗音等小字符上，悬挂到汉字上
 * 会被误读为该汉字的读音故不允许；拉丁字母、数字与标点同样不允许，空白本身即是
 * 可用间距故允许。長音符的 Unicode Script 归为 Common，需单独列出。
 * @param char - 相邻单元靠近本词一侧的字符
 */
function isHangableChar(char: string | undefined): boolean {
  if (char === undefined) return false;
  if (/\s/u.test(char)) return true;
  return /^[\p{Script=Hiragana}\p{Script=Katakana}\u30FC\uFF70]$/u.test(char);
}

/**
 * 估算注音为基字撑开的行内宽度，以单词字号计
 *
 * 注音字号为 0.5em，假名与汉字均按全角计，故撑开量为假名数的一半减去基字数。
 * 逐字注音时各字独立撑开，其总和恒不小于该估算值，按估算值回收不会挤叠基文字。
 * @param atom - 判定单元
 */
function measureExpansion(atom: RubyAtom): number {
  if (atom.rubyText.length === 0) return 0;
  if (!FULL_WIDTH_ONLY.test(atom.text) || !KANA_ONLY.test(atom.rubyText)) return 0;
  const ruby = Array.from(atom.rubyText).length;
  const base = Array.from(atom.text).length;
  return Math.max(0, ruby * RUBY_SIZE_RATIO - base);
}

/**
 * 判断相邻单元能否承接悬挂
 * @param atom - 相邻单元，位于行界时为空
 * @param char - 相邻单元靠近本词一侧的字符
 */
function canReceiveHang(atom: RubyAtom | undefined, char: string | undefined): boolean {
  if (atom === undefined || char === undefined) return false;
  return isHangableChar(char) && measureExpansion(atom) === 0;
}

/**
 * 沿一侧向外检查可承接悬挂的间距是否足够
 *
 * 撑开量按字符数估算，实际字体度量略宽时宁可少回收，也不让假名压到汉字上。
 * @param atoms - 按渲染顺序排列的判定单元
 * @param index - 本词在 atoms 中的下标
 * @param step - 检查方向，向左为 `-1`、向右为 `1`
 */
function hasHangRoom(atoms: readonly RubyAtom[], index: number, step: number): boolean {
  let need = measureExpansion(atoms[index]) / 2;
  for (let i = index + step; ; i += step) {
    const neighbor = atoms[i];
    if (!canReceiveHang(neighbor, neighbor?.text.at(step > 0 ? 0 : -1))) return false;
    need -= Array.from(neighbor.text).length;
    if (need <= 0) return true;
  }
}

/**
 * 估算每个带注音单词可向两侧假名悬挂回收的行内宽度
 *
 * 回收需左右两侧均有 §4067 允许承接悬挂的字符，且注音不越过行界。判定只依赖整行
 * 文本，词在何处折行尚不可知，因此行界只覆盖整行的两端。
 * @param chunks - `chunkAndSplitLyricWords` 的输出，按渲染顺序排列
 * @returns 可回收单词到回收量（em）的映射
 */
export function resolveRubyReclaimMap(
  chunks: readonly (LyricWord | LyricWord[])[],
): Map<LyricWord, number> {
  const atoms: RubyAtom[] = [];
  for (const chunk of chunks) {
    for (const word of Array.isArray(chunk) ? chunk : [chunk]) {
      atoms.push({
        word,
        text: word.word,
        rubyText: (word.ruby ?? []).map((segment) => segment.word.trim()).join(""),
      });
    }
  }

  const reclaimMap = new Map<LyricWord, number>();
  atoms.forEach((atom, index) => {
    const expansion = measureExpansion(atom);
    if (expansion === 0) return;
    if (!hasHangRoom(atoms, index, -1) || !hasHangRoom(atoms, index, 1)) return;
    reclaimMap.set(atom.word, expansion);
  });
  return reclaimMap;
}
