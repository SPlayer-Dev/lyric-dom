/** 歌词行语言；und-Latn 表示语言未知的拉丁文字 */
export type LyricLanguage = "ja" | "ko" | "zh-CN" | "und-Latn";

/** 歌词时间片段 */
export interface LyricSpan {
  /** 起始时间（毫秒） */
  startTime: number;
  /** 结束时间（毫秒） */
  endTime: number;
  /** 内容纯文本 */
  word: string;
}

/** 歌词单词（逐字片段） */
export interface LyricWord extends LyricSpan {
  /** 音译内容 */
  romanWord?: string;
  /**
   * 是否包含不雅用语
   * @default false
   */
  obscene?: boolean;
  /** 注音列表（如日语假名、拼音标注） */
  ruby?: LyricSpan[];
  /**
   * 空拍数量（用于前奏/间奏打拍动效）
   * @default 0
   */
  emptyBeat?: number;
}

/** 一行歌词 */
export interface LyricLine {
  /** 行唯一标识符，如 "L1", "L2" */
  id?: string;
  /** 主歌词语言，用于字形选择与 HTML lang 属性 */
  language?: LyricLanguage;
  /** 该行的所有单词/逐字片段序列 */
  words: LyricWord[];
  /** 该行的翻译歌词内容 */
  translatedLyric: string;
  /** 该行的音译歌词内容 */
  romanLyric: string;
  /** 句子的起始时间（毫秒） */
  startTime: number;
  /** 句子的结束时间（毫秒） */
  endTime: number;
  /**
   * 是否为背景歌词行
   * @default false
   */
  isBG: boolean;
  /**
   * 是否为对唱歌词行（右对齐）
   * @default false
   */
  isDuet: boolean;
  /** 演唱者 ID，如 "v1", "v2" */
  agentId?: string;
  /** 歌曲结构分段标签（如 "Intro", "Verse", "Chorus", "Bridge", "Outro"） */
  songPart?: string;
  /** 所属结构块索引 */
  blockIndex?: number;
}

/** 弹簧动力学参数 */
export interface SpringParams {
  /**
   * 质量
   * @default 0.9
   */
  mass: number;
  /**
   * 阻尼系数
   * @default 15
   */
  damping: number;
  /**
   * 刚度
   * @default 90
   */
  stiffness: number;
  /**
   * 是否强制使用过阻尼模式（纯指数衰减，无振荡）
   * @default false
   */
  soft: boolean;
}

/** 滚动预滚优化配置 */
export interface ScrollPrerollOptions {
  /**
   * 与前一行无重叠时间隔时的提前量（毫秒）
   * @default 600
   */
  advanceNoOverlap: number;
  /**
   * 与前一行存在时间重叠（如对唱）时的提前量（毫秒）
   * @default 400
   */
  advanceOverlap: number;
  /**
   * 时间重叠时的提前边界比例（取前一行时长的比例位置，范围 0~1）
   * @default 0.3
   */
  overlapBoundaryRatio: number;
}

/**
 * 歌词行点击回调函数
 * @param timeMs - 点击行的起始时间（毫秒）
 */
export type LineClickCallback = (timeMs: number) => void;

/** 渲染器配置选项 */
export interface RendererConfig {
  /**
   * 激活行在视口中的垂直居中锚定比例（0~1）
   * @default 0.35
   */
  alignPosition: number;
  /**
   * 播放状态
   * @default false
   */
  playing: boolean;
  /** 自定义弹簧动力学参数 */
  springConfig: Partial<SpringParams>;
  /**
   * 逐字高亮渐变遮罩的边缘过渡宽度比例（0~1）
   * @default 0.5
   */
  wordFadeWidth: number;
  /**
   * 用户手动滚动后，自动恢复跟随播放进度的延迟时间（毫秒）
   * @default 5000
   */
  scrollResetDelay: number;
  /**
   * 触发间奏圆点动效的最小间隔时长（毫秒）
   * @default 4000
   */
  minInterludeGap: number;
  /**
   * 间奏圆点呼吸动画的目标周期（毫秒）
   * @default 1500
   */
  breatheCycleTarget: number;
  /**
   * 非激活行的基础透明度（0~1）
   * @default 0.2
   */
  inactiveAlpha: number;
  /**
   * 是否隐藏已播放完毕的历史行
   * @default false
   */
  hidePassedLines: boolean;
  /**
   * 是否启用距离视口边缘的逐行动态模糊
   * @default false
   */
  enableBlur: boolean;
  /**
   * 是否启用逐字流光高亮渲染
   * @default true
   */
  enableWordHighlight: boolean;
  /**
   * 是否启用逐字上浮位移动画
   * @default false
   */
  enableFloatAnimation: boolean;
  /**
   * 是否启用长音节强调辉光（按需为激活行创建动画）
   * @default false
   */
  enableEmphasizeEffect: boolean;
  /**
   * 触发强调辉光的最小音节时长（毫秒）
   * @default 1000
   */
  emphasizeMinDuration: number;
  /**
   * 是否启用歌词缩放效果
   * @default true
   */
  enableScale: boolean;
  /**
   * 是否显示翻译歌词
   * @default true
   */
  showTranslation: boolean;
  /**
   * 是否显示音译歌词
   * @default true
   */
  showRomanization: boolean;
  /**
   * 是否显示逐字音译
   * @default false
   */
  showWordRomanization: boolean;
  /**
   * 是否显示词内注音（ruby）
   * @default false
   */
  showRuby: boolean;
  /**
   * 是否始终将背景行置于主行下方（忽略首词时间先后的上置判定）
   * @default false
   */
  bgAlwaysBelow: boolean;
  /**
   * 是否启用滚动预滚优化
   * @default true
   */
  enableScrollPreroll: boolean;
  /** 滚动预滚微调参数 */
  scrollPrerollOptions: Partial<ScrollPrerollOptions>;
  /**
   * 识别用户跳转播放进度（seek）的后退时间阈值（毫秒）
   * @default 100
   */
  seekBackwardThreshold: number;
  /**
   * 识别用户跳转播放进度（seek）的前进时间阈值（毫秒）
   * @default 2000
   */
  seekForwardThreshold: number;
  /** 歌词行点击回调函数 */
  onLineClick?: LineClickCallback;
}

/** 单个单词 DOM 元素的测量数据 */
export interface WordMeasurement {
  /** 对应的 HTML span 元素 */
  element: HTMLSpanElement;
  /** 关联的单词数据 */
  word: LyricWord;
  /** 元素渲染宽度（像素） */
  width: number;
  /** 遮罩渐变区域宽度（像素） */
  fadeWidth: number;
}

/** 单词动画渲染目标描述（供 Web Animations API 懒创建） */
export interface WordAnimTarget {
  /** 挂载位移动画的 DOM 元素 */
  element: HTMLElement;
  /** 单词数据 */
  word: LyricWord;
  /** 是否为强调动画目标 */
  isEmphasize?: boolean;
  /** 强调动画的字符节点 */
  charElements?: HTMLElement[];
  /** 强调组是否位于行末 */
  isLastWord?: boolean;
}
