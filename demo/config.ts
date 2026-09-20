import type { LyricAlignment } from "../src";
import { DEFAULTS } from "../src";
import type { ControlDef } from "./panel";

export const STORAGE_KEY = "lyric_dom_demo_state";

/** 弹簧动画预设类型 */
export type SpringPreset =
  | "default"
  | "smooth"
  | "responsive"
  | "jello"
  | "heavy"
  | "noBounce"
  | "custom";

/** 弹簧预设参数映射 */
export const SPRING_PRESETS: Record<
  Exclude<SpringPreset, "custom">,
  { mass: number; damping: number; stiffness: number }
> = {
  default: { mass: 0.9, damping: 15, stiffness: 90 },
  smooth: { mass: 1.2, damping: 22, stiffness: 80 },
  responsive: { mass: 0.5, damping: 18, stiffness: 150 },
  jello: { mass: 0.6, damping: 8, stiffness: 120 },
  heavy: { mass: 2.0, damping: 25, stiffness: 60 },
  noBounce: { mass: 1.0, damping: 30, stiffness: 100 },
};

export interface DemoState extends Record<string, unknown> {
  fontSize: number;
  alignPosition: number;
  alignment: LyricAlignment;
  wordFadeWidth: number;
  enableWordHighlight: boolean;
  minInterludeGap: number;
  breatheCycleTarget: number;
  inactiveAlpha: number;
  hidePassedLines: boolean;
  enableBlur: boolean;
  enableFloatAnimation: boolean;
  enableEmphasizeEffect: boolean;
  enableScale: boolean;
  showTranslation: boolean;
  showRomanization: boolean;
  showWordRomanization: boolean;
  showRuby: boolean;
  bgAlwaysBelow: boolean;
  enableScrollPreroll: boolean;
  scrollResetDelay: number;
  seekForwardThreshold: number;
  springPreset: SpringPreset;
  "spring.mass": number;
  "spring.damping": number;
  "spring.stiffness": number;
  "spring.soft": boolean;
}

export const createInitialState = (): DemoState => ({
  fontSize: 30,
  alignPosition: DEFAULTS.alignPosition,
  alignment: DEFAULTS.alignment,
  wordFadeWidth: DEFAULTS.wordFadeWidth,
  enableWordHighlight: DEFAULTS.enableWordHighlight,
  minInterludeGap: DEFAULTS.minInterludeGap,
  breatheCycleTarget: DEFAULTS.breatheCycleTarget,
  inactiveAlpha: DEFAULTS.inactiveAlpha,
  hidePassedLines: DEFAULTS.hidePassedLines,
  enableBlur: DEFAULTS.enableBlur,
  enableFloatAnimation: DEFAULTS.enableFloatAnimation,
  enableEmphasizeEffect: DEFAULTS.enableEmphasizeEffect,
  enableScale: DEFAULTS.enableScale,
  showTranslation: DEFAULTS.showTranslation,
  showRomanization: DEFAULTS.showRomanization,
  showWordRomanization: DEFAULTS.showWordRomanization,
  showRuby: DEFAULTS.showRuby,
  bgAlwaysBelow: DEFAULTS.bgAlwaysBelow,
  enableScrollPreroll: DEFAULTS.enableScrollPreroll,
  scrollResetDelay: DEFAULTS.scrollResetDelay,
  seekForwardThreshold: DEFAULTS.seekForwardThreshold,
  springPreset: "default",
  "spring.mass": SPRING_PRESETS.default.mass,
  "spring.damping": SPRING_PRESETS.default.damping,
  "spring.stiffness": SPRING_PRESETS.default.stiffness,
  "spring.soft": false,
});

/** 从 localStorage 读取持久化状态，若无或异常则返回初始默认值 */
export const loadState = (): DemoState => {
  const initial = createInitialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return { ...initial, ...parsed };
    }
  } catch (err) {
    console.warn("读取持久化配置失败，使用默认配置:", err);
  }
  return initial;
};

/** 持久化保存当前状态到 localStorage */
export const saveState = (state: DemoState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("保存持久化配置失败:", err);
  }
};

/** 清除已保存的持久化配置 */
export const clearSavedState = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("清除持久化配置失败:", err);
  }
};

export const REBUILD_KEYS = new Set([
  "enableFloatAnimation",
  "enableEmphasizeEffect",
  "showTranslation",
  "showRomanization",
  "showWordRomanization",
  "showRuby",
  "bgAlwaysBelow",
  "enableScrollPreroll",
]);

export const CONTROL_DEFS: ControlDef<DemoState>[] = [
  { type: "group", label: "布局与字号" },
  { key: "fontSize", label: "字体大小(px)", type: "range", min: 16, max: 64, step: 1 },
  { key: "alignPosition", label: "对齐位置", type: "range", min: 0, max: 1, step: 0.01 },
  {
    key: "alignment",
    label: "水平对齐",
    type: "select",
    options: [
      { value: "auto", label: "自动" },
      { value: "left", label: "居左" },
      { value: "center", label: "居中" },
      { value: "right", label: "居右" },
    ],
  },
  { type: "group", label: "逐字高亮" },
  { key: "wordFadeWidth", label: "渐变宽度", type: "range", min: 0, max: 1, step: 0.01 },
  { key: "enableWordHighlight", label: "逐字高亮", type: "toggle" },
  { type: "group", label: "间奏圆点" },
  { key: "minInterludeGap", label: "最小间隔", type: "range", min: 0, max: 10000, step: 500 },
  { key: "breatheCycleTarget", label: "呼吸周期", type: "range", min: 500, max: 4000, step: 100 },
  { type: "group", label: "透明度" },
  { key: "inactiveAlpha", label: "非激活透明度", type: "range", min: 0.05, max: 1, step: 0.05 },
  { key: "hidePassedLines", label: "隐藏已播行", type: "toggle" },
  { type: "group", label: "动效" },
  { key: "enableBlur", label: "逐行模糊", type: "toggle" },
  { key: "enableScale", label: "歌词缩放", type: "toggle" },
  { key: "enableFloatAnimation", label: "逐字上浮", type: "toggle" },
  { key: "enableEmphasizeEffect", label: "强调辉光", type: "toggle" },
  { type: "group", label: "文本与音标" },
  { key: "showTranslation", label: "显示翻译", type: "toggle" },
  { key: "showRomanization", label: "行音译歌词", type: "toggle" },
  { key: "showWordRomanization", label: "逐字音译", type: "toggle" },
  { key: "showRuby", label: "显示注音", type: "toggle" },
  { type: "group", label: "背景和声" },
  { key: "bgAlwaysBelow", label: "始终下置", type: "toggle" },
  { type: "group", label: "滚动与优化" },
  { key: "enableScrollPreroll", label: "滚动提前预滚", type: "toggle" },
  { key: "scrollResetDelay", label: "回弹延迟", type: "range", min: 0, max: 15000, step: 500 },
  {
    key: "seekForwardThreshold",
    label: "Seek前进门槛",
    type: "range",
    min: 500,
    max: 5000,
    step: 100,
  },
  { type: "group", label: "弹簧参数" },
  {
    key: "springPreset",
    label: "弹簧预设",
    type: "select",
    options: [
      { value: "default", label: "默认" },
      { value: "smooth", label: "更平滑" },
      { value: "responsive", label: "快速跟手" },
      { value: "jello", label: "果冻感" },
      { value: "heavy", label: "厚重缓慢" },
      { value: "noBounce", label: "无弹跳" },
      { value: "custom", label: "自定义" },
    ],
  },
  { key: "spring.mass", label: "质量", type: "range", min: 0.1, max: 5, step: 0.1 },
  { key: "spring.damping", label: "阻尼", type: "range", min: 1, max: 60, step: 0.5 },
  { key: "spring.stiffness", label: "刚度", type: "range", min: 10, max: 500, step: 5 },
  { key: "spring.soft", label: "过阻尼(soft)", type: "toggle" },
];
