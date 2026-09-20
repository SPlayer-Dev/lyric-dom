/**
 * 歌词渲染引擎 — 默认配置常量
 */

import type { LyricAlignment } from "../types";
import { DEFAULT_SCROLL_PREROLL_OPTIONS } from "../utils/scroll-preroll";

export const DEFAULTS = {
  /** 用户滚动后自动回弹的延迟时间（毫秒） */
  scrollResetDelay: 5000,
  /** 触发间奏动画的最小间隔时长（毫秒） */
  minInterludeGap: 4000,
  /** 间奏圆点呼吸动画的目标周期（毫秒） */
  breatheCycleTarget: 1500,
  /** 透明度增加速度（激活时） */
  alphaAttackSpeed: 16,
  /** 透明度衰减速度（取消激活时） */
  alphaReleaseSpeed: 7,
  /** 非激活行的基础透明度 */
  inactiveAlpha: 0.2,
  /** 激活行在容器中的对齐位置（0~1） */
  alignPosition: 0.35,
  /** 歌词行水平对齐方式 */
  alignment: "auto" as LyricAlignment,
  /** 逐字掩码渐变宽度比例 */
  wordFadeWidth: 0.5,
  /** 是否隐藏已播放行 */
  hidePassedLines: false,
  /** 是否启用逐行模糊效果 */
  enableBlur: false,
  /** 是否启用逐字高亮效果 */
  enableWordHighlight: true,
  /** 是否启用逐字上浮动画 */
  enableFloatAnimation: false,
  /** 是否启用长音节强调辉光 */
  enableEmphasizeEffect: false,
  /** 触发强调辉光的最小音节时长（毫秒） */
  emphasizeMinDuration: 1000,
  /** 是否启用歌词缩放效果（开启时非激活行轻微缩小） */
  enableScale: true,
  /** 是否显示翻译歌词 */
  showTranslation: true,
  /** 是否显示音译歌词 */
  showRomanization: true,
  /** 是否显示逐字音译 */
  showWordRomanization: false,
  /** 是否显示词内注音（ruby） */
  showRuby: false,
  /** 是否始终将背景行置于主行下方 */
  bgAlwaysBelow: false,
  /** 是否启用滚动预滚优化 */
  enableScrollPreroll: true,
  /** 滚动预滚微调参数 */
  scrollPrerollOptions: DEFAULT_SCROLL_PREROLL_OPTIONS,
  /** 播放跳转识别后退阈值（毫秒） */
  seekBackwardThreshold: 100,
  /** 播放跳转识别前进阈值（毫秒） */
  seekForwardThreshold: 2000,
};

export type { RendererConfig } from "../types";
