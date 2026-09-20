/**
 * 长音节强调动画
 *
 * 为满足时长与文本条件的歌词词组创建逐字符缩放、辉光和上浮动画
 * 动画实例由行级动画控制器统一负责播放、暂停与销毁
 */

import type { LyricWord } from "../types";
import { isCJK } from "../utils/split-words";

const FRAME_COUNT = 32;

/** 将数值限制在 0 到 1 之间 */
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** 生成两端速度平缓的三次插值结果 */
const smoothstep = (value: number) => value * value * (3 - 2 * value);

/** 生成从零增强至峰值后再回落至零的对称曲线 */
const emphasisEasing = (value: number) =>
  value < 0.5 ? smoothstep(clamp01(value * 2)) : 1 - smoothstep(clamp01((value - 0.5) * 2));

/** 生成可直接写入 CSS transform 的三维缩放矩阵 */
const scaleMatrix3d = (scale: number) =>
  `matrix3d(${scale},0,0,0,0,${scale},0,0,0,0,${scale},0,0,0,0,1)`;

/**
 * 判断单个歌词片段是否应使用强调动画
 *
 * CJK 片段只要求达到持续时间阈值；非 CJK 片段还要求去除空白后的长度为 2 到 7
 *
 * @param word - 待判断的歌词片段
 * @param minDuration - 触发强调动画所需的最短持续时间，单位为毫秒
 * @returns 该片段是否满足强调条件
 */
export const shouldEmphasize = (word: LyricWord, minDuration = 1000): boolean => {
  if (word.endTime - word.startTime < minDuration) return false;
  const text = word.word.trim();
  return isCJK(text) || (text.length > 1 && text.length <= 7);
};

/**
 * 判断一个分词词组是否应使用强调动画
 *
 * 词组中任一片段满足条件时直接启用；多个非 CJK 片段还会按合并后的文本和时间范围
 * 再判断一次，以支持被时间轴拆开的西文单词
 *
 * @param words - 属于同一分词词组的歌词片段
 * @param minDuration - 触发强调动画所需的最短持续时间，单位为毫秒
 * @returns 该词组是否满足强调条件
 */
export const shouldChunkEmphasize = (words: LyricWord[], minDuration = 1000): boolean => {
  if (words.some((word) => shouldEmphasize(word, minDuration))) return true;
  if (words.length < 2) return false;
  const merged: LyricWord = {
    word: words.map((word) => word.word).join(""),
    startTime: Math.min(...words.map((word) => word.startTime)),
    endTime: Math.max(...words.map((word) => word.endTime)),
  };
  return !isCJK(merged.word) && shouldEmphasize(merged, minDuration);
};

/**
 * 为强调词组的字符节点创建缩放、辉光与正弦上浮动画
 *
 * 返回的动画默认处于暂停状态，时间轴位置和播放状态由调用方统一设置行末词会获得
 * 更强且持续时间更长的强调；背景人声的上浮距离会加倍
 *
 * @param characterElements - 按显示顺序排列的字符节点
 * @param duration - 词组的原始持续时间，单位为毫秒
 * @param delay - 词组相对歌词行起始时间的延迟，单位为毫秒
 * @param isLastWord - 词组是否位于当前歌词行末尾
 * @param isBG - 当前歌词行是否为背景人声
 * @returns 已创建且处于暂停状态的 Web Animations 动画实例
 */
export const createEmphasizeAnimations = (
  characterElements: HTMLElement[],
  duration: number,
  delay: number,
  isLastWord: boolean,
  isBG: boolean,
): Animation[] => {
  const safeDelay = Math.max(0, delay);
  let safeDuration = Math.max(1000, duration);
  const characterCount = Math.max(1, characterElements.length);

  let amount = safeDuration / 2000;
  amount = amount > 1 ? Math.sqrt(amount) : amount ** 3;
  let blur = safeDuration / 3000;
  blur = blur > 1 ? Math.sqrt(blur) : blur ** 3;
  amount *= 0.6;
  blur *= 0.5;
  if (isLastWord) {
    amount *= 1.6;
    blur *= 1.5;
    safeDuration *= 1.2;
  }
  amount = Math.min(1.2, amount);
  blur = Math.min(0.8, blur);

  const animations: Animation[] = [];
  for (let index = 0; index < characterElements.length; index++) {
    const element = characterElements[index];
    const characterDelay = safeDelay + (safeDuration / 2.5 / characterCount) * index;
    const glowFrames: Keyframe[] = Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
      const progress = (frameIndex + 1) / FRAME_COUNT;
      const eased = emphasisEasing(progress);
      const scale = 1 + eased * 0.1 * amount;
      const offsetX = -eased * 0.03 * amount * (characterCount / 2 - index);
      const offsetY = -eased * 0.025 * amount;
      return {
        offset: progress,
        transform: `${scaleMatrix3d(scale)} translate(${offsetX}em, ${offsetY}em)`,
        textShadow: `0 0 ${Math.min(0.3, blur * 0.3)}em rgba(255, 255, 255, ${eased * blur})`,
      };
    });
    const glow = element.animate(glowFrames, {
      duration: safeDuration,
      delay: Number.isFinite(characterDelay) ? characterDelay : 0,
      id: `emphasize-glow-${index}`,
      composite: "replace",
      fill: "both",
    });
    glow.onfinish = () => glow.pause();
    glow.pause();
    animations.push(glow);

    const floatFrames: Keyframe[] = Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
      const progress = (frameIndex + 1) / FRAME_COUNT;
      const height = Math.sin(progress * Math.PI) * (isBG ? 2 : 1);
      return { offset: progress, transform: `translateY(${-height * 0.05}em)` };
    });
    const float = element.animate(floatFrames, {
      duration: safeDuration * 1.4,
      delay: Number.isFinite(characterDelay) ? characterDelay - 400 : 0,
      id: "emphasize-float",
      composite: "add",
      fill: "both",
    });
    float.onfinish = () => float.pause();
    float.pause();
    animations.push(float);
  }
  return animations;
};
