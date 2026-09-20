import type { LyricLine, RendererConfig, ScrollPrerollOptions, SpringParams } from "../types";
import { setMin } from "../utils/math";
import { syncMainAndBackgroundLines } from "../utils/normalize";
import { applyScrollPreroll } from "../utils/scroll-preroll";
import { DEFAULTS } from "./constants";
import {
  createInterludeDots,
  detectInterlude,
  type InterludeCache,
  type InterludeState,
  renderInterludeDots,
} from "./interlude";
import { LineAnimationController } from "./line-animations";
import { buildLineElements } from "./line-builder";
import { Spring } from "./spring";
import {
  measureAndApplyWordMasks,
  type WordAnimTarget,
  type WordMeasurement,
} from "./word-builder";

export type { RendererConfig } from "../types";

export class LyricRenderer {
  /** 外层容器 */
  private container: HTMLElement;
  /** 承载所有歌词行和间奏圆点的包裹层 */
  private innerElement: HTMLDivElement;
  /** 间奏呼吸圆点容器 */
  private dotsContainer!: HTMLDivElement;
  /** 三个间奏圆点元素 */
  private dotElements!: [HTMLSpanElement, HTMLSpanElement, HTMLSpanElement];

  /** 歌词行数据 */
  private lines: LyricLine[] = [];
  /** 每行对应的 DOM 元素 */
  private lineElements: HTMLDivElement[] = [];
  /** 每行的单词测量数据 */
  private wordMeasurements: WordMeasurement[][] = [];
  /** 每行的单词动画目标 */
  private lineAnimTargets: WordAnimTarget[][] = [];
  /** 当前歌词是否包含逐字时间轴 */
  private hasWordTiming = false;
  /** 行级 Web Animations 生命周期管理 */
  private lineAnimations = new LineAnimationController((lineIndex) =>
    this.activeLineSet.has(lineIndex),
  );

  /** 当前主激活行索引，多行激活时取最小 */
  private activeLineIndex = -1;
  /** 所有激活行索引集合 */
  private activeLineSet = new Set<number>();
  /** 上一次处理的播放时间，seek 检测基准 */
  private lastProcessedTime = -1;
  /** processTime 复用缓冲，避免每帧分配 */
  private activatedBuffer: number[] = [];
  private deactivatedBuffer = new Set<number>();

  /** 每行的 Y 轴位置弹簧 */
  private positionSprings: Spring[] = [];
  /** 每行的缩放弹簧，值域 0~100 对应 0~1 的 scale */
  private scaleSprings: Spring[] = [];

  /** 每行高度缓存 */
  private lineHeights: Float64Array = new Float64Array(0);
  /** 副行浮层展开进度（0 收拢 → 1 撑开），仅驱动浮层显隐与折叠；行组占位由激活态一次让出 */
  private bgExpandValues: Float64Array = new Float64Array(0);
  /** --lp-bg-progress 写入缓存 */
  private cachedBgKeys: string[] = [];
  /** 背景副行是否置于主行上方 */
  private isBgAbove: boolean[] = [];
  /** 容器尺寸 */
  private containerWidth = 0;
  private containerHeight = 0;

  /** 透明度插值，驱动 --ba / --da */
  private alphaValues: Float64Array = new Float64Array(0);
  /** 模糊插值，驱动 --blur */
  private blurValues: Float64Array = new Float64Array(0);
  /** 已播行淡出值，驱动 --pass */
  private passValues: Float64Array = new Float64Array(0);
  /** --pass 写入缓存 */
  private cachedPassKeys: string[] = [];

  /** 入场动画完成后跳过相关计算 */
  private entranceComplete = true;

  /** 用户手动滚动偏移量 */
  private userScrollOffset = 0;
  /** 是否处于用户滚动状态 */
  private isUserScrolling = false;
  /** 悬停时抑制模糊 */
  private isHovering = false;
  /** 滚动回弹定时器 ID */
  private scrollResetTimerId = 0;
  /** 上一次触摸 Y 坐标 */
  private lastTouchY = 0;

  /** 间奏状态 */
  private interludeState: InterludeState = {
    isActive: false,
    startTime: 0,
    endTime: 0,
    x: 0,
    y: 0,
    alignRight: false,
    anchorIndex: 0,
    anchorOffset: 0,
  };
  /** 间奏渲染缓存 */
  private interludeCache: InterludeCache = {
    containerStyle: "",
    dotOpacities: ["", "", ""],
  };
  /** 间奏圆点容器尺寸 */
  private dotsContainerWidth = 0;
  private dotsContainerHeight = 0;

  /** rAF 句柄，0 表示未运行 */
  private animationFrameId = 0;
  /** 掩码计算延迟 rAF 句柄 */
  private maskRafId = 0;
  /** 上一帧时间戳，用于计算 deltaTime */
  private lastFrameTimestamp = 0;
  /** 页面是否可见 */
  private isPageVisible = true;
  /** 跳过视口裁剪，下一帧全量同步 */
  private needsFullSync = false;
  /** 隐藏/冻结恢复后，下一次时间跳变时瞬移布局而非弹簧过渡 */
  private snapNextSeek = false;
  /** 页面隐藏期间缓冲的歌词，恢复可见时应用 */
  private pendingHiddenLyrics: LyricLine[] | null = null;
  /** 外部推送的待消费播放时间 */
  private pendingPlayTime = -1;

  /** transform 写入缓存 */
  private cachedTransforms: string[] = [];
  private lineWillChange: boolean[] = [];
  /** 视口裁剪标记 */
  private lineCulled: boolean[] = [];
  /** bottom-line 是否已挂 will-change */
  private bottomWillChange = false;
  /** bottom-line 是否已被视口裁剪 */
  private bottomCulled = false;
  /** 透明度缓存 */
  private cachedAlphaKeys: string[] = [];
  /** 模糊缓存 */
  private cachedBlurKeys: string[] = [];
  /** --t 时间缓存 */
  private cachedTimeString = "";

  /** 激活行在容器中的对齐位置（0~1） */
  private alignPosition = DEFAULTS.alignPosition;
  /** 是否正在播放 */
  private isPlaying = true;
  /** 逐字掩码渐变宽度比例 */
  private wordFadeWidth = DEFAULTS.wordFadeWidth;
  /** 弹簧物理参数 */
  private springParams: Partial<SpringParams> = {};
  /** 歌词行点击回调 */
  private lineClickCallback: ((timeMs: number) => void) | null = null;
  /** 用户滚动后回弹延迟（ms） */
  private scrollResetDelay = DEFAULTS.scrollResetDelay;
  /** 触发间奏动画的最小间隔（ms） */
  private minInterludeGap = DEFAULTS.minInterludeGap;
  /** 间奏圆点呼吸周期（ms） */
  private breatheCycleTarget = DEFAULTS.breatheCycleTarget;
  /** 透明度激活速度 */
  private alphaAttackSpeed = DEFAULTS.alphaAttackSpeed;
  /** 透明度释放速度 */
  private alphaReleaseSpeed = DEFAULTS.alphaReleaseSpeed;
  /** 非激活行基础透明度 */
  private inactiveAlpha = DEFAULTS.inactiveAlpha;
  /** 是否隐藏已播放行 */
  private hidePassedLines = DEFAULTS.hidePassedLines;
  /** 是否启用逐行模糊 */
  private enableBlur = DEFAULTS.enableBlur;
  /** 是否启用逐字高亮 */
  private enableWordHighlight = DEFAULTS.enableWordHighlight;
  /** 是否启用逐字上浮动画 */
  private enableFloatAnimation = DEFAULTS.enableFloatAnimation;
  /** 是否启用长音节强调辉光 */
  private enableEmphasizeEffect = DEFAULTS.enableEmphasizeEffect;
  /** 是否启用歌词缩放效果 */
  private enableScale = DEFAULTS.enableScale;
  /** 是否显示翻译歌词 */
  private showTranslation = DEFAULTS.showTranslation;
  /** 是否显示音译歌词 */
  private showRomanization = DEFAULTS.showRomanization;
  /** 是否显示逐字音译 */
  private showWordRomanization = DEFAULTS.showWordRomanization;
  /** 是否显示词内注音（ruby） */
  private showRuby = DEFAULTS.showRuby;
  /** 是否始终将背景行置于主行下方 */
  private bgAlwaysBelow = DEFAULTS.bgAlwaysBelow;
  /** 原始歌词数据（未应用滚动预滚前，用于动态开关预滚时重新计算） */
  private rawLines: LyricLine[] = [];
  /** 是否启用滚动提前预滚优化 */
  private enableScrollPreroll = DEFAULTS.enableScrollPreroll;
  /** 滚动提前预滚参数微调 */
  private scrollPrerollOptions: Partial<ScrollPrerollOptions> = {
    ...DEFAULTS.scrollPrerollOptions,
  };
  /** 播放跳转识别后退阈值（ms） */
  private seekBackwardThreshold = DEFAULTS.seekBackwardThreshold;
  /** 播放跳转识别前进阈值（ms） */
  private seekForwardThreshold = DEFAULTS.seekForwardThreshold;
  /** 触发强调辉光的最小音节时长 */
  private emphasizeMinDuration = DEFAULTS.emphasizeMinDuration;

  /** 容器尺寸变化观察器 */
  private containerResizeObserver: ResizeObserver;
  /** 哨兵行尺寸观察器（检测字体/样式变化） */
  private sentinelResizeObserver: ResizeObserver;
  /** 哨兵行元素 */
  private sentinelElement: HTMLDivElement | null = null;

  /** bottom-line 容器 */
  private bottomLineEl!: HTMLDivElement;
  /** bottom-line 的 Y 轴位置弹簧 */
  private bottomLineSpring = new Spring(2000);
  /** bottom-line transform 缓存 */
  private cachedBottomTransform = "";

  /**
   * 歌词渲染器
   * @param container - 外层容器元素
   * @param config - 可选的初始配置
   */
  constructor(container: HTMLElement, config?: Partial<RendererConfig>) {
    this.container = container;
    // 移除上一次实例残留的 lp-inner
    for (const stale of Array.from(container.querySelectorAll(":scope > .lp-inner"))) {
      stale.remove();
    }
    container.classList.add("lp-root");
    // 创建内部包裹层
    this.innerElement = document.createElement("div");
    this.innerElement.className = "lp-inner";
    container.appendChild(this.innerElement);
    // 创建间奏圆点
    [this.dotsContainer, this.dotElements] = createInterludeDots(this.innerElement);
    // 创建 bottom-line 容器
    this.bottomLineEl = document.createElement("div");
    this.bottomLineEl.className = "lp-credit";
    this.innerElement.appendChild(this.bottomLineEl);
    if (config) this.applyConfig(config);
    // 缓存容器尺寸
    this.containerWidth = container.clientWidth;
    this.containerHeight = container.clientHeight;
    // 尺寸观察器
    this.containerResizeObserver = new ResizeObserver(this.handleContainerResize);
    this.containerResizeObserver.observe(container);
    this.sentinelResizeObserver = new ResizeObserver(this.handleSentinelResize);
    // 事件监听
    container.addEventListener("wheel", this.handleWheel, { passive: false });
    container.addEventListener("touchstart", this.handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchmove", this.handleTouchMove, {
      passive: false,
    });
    container.addEventListener("touchend", this.handleTouchEnd, {
      passive: true,
    });
    container.addEventListener("click", this.handleLineClick);
    container.addEventListener("mouseenter", this.handleMouseEnter);
    container.addEventListener("mouseleave", this.handleMouseLeave);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    // 启动渲染循环
    this.animationFrameId = requestAnimationFrame(this.onAnimationFrame);
  }

  /** 冻结渲染 */
  freeze = () => {
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
    // 断开 observer
    this.containerResizeObserver.disconnect();
    this.sentinelResizeObserver.disconnect();
    // 停用中的行动画一旦被 pause 就不会再触发 onfinish 清理，直接取消，避免 fill 状态永久残留
    this.lineAnimations.cleanupInactive();
    this.lineAnimations.pauseAll();
  };

  /** 恢复渲染 */
  resume = () => {
    if (this.animationFrameId !== 0) return;
    this.containerResizeObserver.observe(this.container);
    if (this.sentinelElement) {
      this.sentinelResizeObserver.observe(this.sentinelElement);
    }
    this.lastFrameTimestamp = 0;
    this.needsFullSync = true;
    // 冻结期间播放进度可能大幅前进，恢复后的首次时间推送若检测到跳变则瞬移布局
    this.snapNextSeek = true;
    // 恢复时按当前播放时间重新对齐动画 currentTime 后再 play
    if (this.isPlaying) {
      this.lineAnimations.realignActive(this.lines, this.lastProcessedTime);
    }
    this.animationFrameId = requestAnimationFrame(this.onAnimationFrame);
  };

  /** 销毁渲染器 */
  dispose = () => {
    cancelAnimationFrame(this.animationFrameId);
    cancelAnimationFrame(this.maskRafId);
    clearTimeout(this.scrollResetTimerId);
    this.lineAnimations.cancelAll();
    this.containerResizeObserver.disconnect();
    this.sentinelResizeObserver.disconnect();
    this.container.removeEventListener("wheel", this.handleWheel);
    this.container.removeEventListener("touchstart", this.handleTouchStart);
    this.container.removeEventListener("touchmove", this.handleTouchMove);
    this.container.removeEventListener("touchend", this.handleTouchEnd);
    this.container.removeEventListener("click", this.handleLineClick);
    this.container.removeEventListener("mouseenter", this.handleMouseEnter);
    this.container.removeEventListener("mouseleave", this.handleMouseLeave);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.innerElement.remove();
    this.container.classList.remove("lp-root", "lp-has-duet");
  };

  /**
   * 设置歌词数据
   * @param lines - 歌词行数组
   */
  setLyrics = (lines: LyricLine[]) => {
    if (!this.isPageVisible) {
      this.pendingHiddenLyrics = lines;
      return;
    }
    const clonedLines = lines.map((line) => ({
      ...line,
      words: line.words ? line.words.map((w) => ({ ...w })) : [],
    }));
    // 首行与连续背景行无主行可依附，降级为主行
    let consecutiveBgCount = 0;
    for (let i = 0; i < clonedLines.length; i++) {
      const line = clonedLines[i];
      if (!line.isBG) {
        consecutiveBgCount = 0;
        continue;
      }
      consecutiveBgCount++;
      if (i === 0 || consecutiveBgCount > 1) line.isBG = false;
    }
    syncMainAndBackgroundLines(clonedLines);
    this.rawLines = clonedLines;
    const processedLines = this.enableScrollPreroll
      ? applyScrollPreroll(clonedLines, this.scrollPrerollOptions)
      : clonedLines.map((line) => ({ ...line }));

    const seekTime = this.pendingPlayTime >= 0 ? this.pendingPlayTime : 0;
    this.lineAnimations.cancelAll();
    for (const element of this.lineElements) element.remove();
    // 重置状态
    this.lines = processedLines;
    this.hasWordTiming = processedLines.some((line) => line.words.length > 1);
    this.activeLineIndex = -1;
    this.activeLineSet.clear();
    this.lastProcessedTime = -1;
    this.userScrollOffset = 0;
    this.interludeState.isActive = false;
    // 含对唱行时启用左右分栏布局
    this.container.classList.toggle(
      "lp-has-duet",
      processedLines.some((line) => line.isDuet),
    );

    const lineCount = processedLines.length;

    // 初始化弹簧（位置弹簧初始在屏幕外，缩放弹簧初始 97%）
    const offScreen = Math.max(this.containerHeight * 2, 2000);
    // bottom-line 重置到屏外，由 calculateLayout 重新定位到末行下方
    this.bottomLineSpring.setPosition(offScreen);
    this.cachedBottomTransform = "";
    this.positionSprings = new Array(lineCount);
    this.scaleSprings = new Array(lineCount);
    for (let i = 0; i < lineCount; i++) {
      this.positionSprings[i] = new Spring(offScreen);
      const scaleSpring = new Spring(97);
      scaleSpring.updateParams(
        processedLines[i].isBG
          ? { mass: 1, damping: 20, stiffness: 50 }
          : { mass: 2, damping: 25, stiffness: 100 },
      );
      this.scaleSprings[i] = scaleSpring;
    }
    this.applySpringParams();

    // 初始化透明度为非激活值
    this.alphaValues = new Float64Array(lineCount * 2);
    for (let i = 0; i < lineCount; i++) {
      this.alphaValues[i * 2] = this.inactiveAlpha;
      this.alphaValues[i * 2 + 1] = this.inactiveAlpha;
    }

    // 初始化缓存数组
    this.lineHeights = new Float64Array(lineCount);
    this.bgExpandValues = new Float64Array(lineCount);
    this.cachedBgKeys = new Array(lineCount).fill("");
    this.cachedTransforms = new Array(lineCount).fill("");
    this.lineWillChange = new Array(lineCount).fill(false);
    this.lineCulled = new Array(lineCount).fill(false);
    this.cachedAlphaKeys = new Array(lineCount).fill("");
    this.cachedBlurKeys = new Array(lineCount).fill("");
    this.blurValues = new Float64Array(lineCount);
    this.passValues = new Float64Array(lineCount).fill(1);
    this.cachedPassKeys = new Array(lineCount).fill("");

    this.entranceComplete = false;

    // 构建 DOM
    const built = buildLineElements(this.lines, {
      enableEmphasizeEffect: this.enableEmphasizeEffect,
      emphasizeMinDuration: this.emphasizeMinDuration,
      showTranslation: this.showTranslation,
      showRomanization: this.showRomanization,
      showWordRomanization: this.showWordRomanization,
      showRuby: this.showRuby,
      bgAlwaysBelow: this.bgAlwaysBelow,
    });
    this.lineElements = built.lineElements;
    this.wordMeasurements = built.wordMeasurements;
    this.lineAnimTargets = built.lineAnimTargets;
    this.isBgAbove = built.isBgAbove;
    this.innerElement.appendChild(built.fragment);
    this.innerElement.appendChild(this.bottomLineEl);

    // 哨兵观察器：监听第一行尺寸变化以检测字体/样式变化
    this.sentinelResizeObserver.disconnect();
    this.sentinelElement = null;
    if (lineCount > 0) {
      this.sentinelElement = this.lineElements[0];
      this.sentinelResizeObserver.observe(this.sentinelElement);
    }

    // 测量尺寸 + 计算 CSS mask
    this.dotsContainerWidth = this.dotsContainer.offsetWidth || 60;
    this.dotsContainerHeight = this.dotsContainer.offsetHeight || 20;
    this.measureLineHeights();
    // 掩码计算延迟到下一帧，避免与 DOM 构建/行高测量在同一帧内造成帧丢失
    this.maskRafId = requestAnimationFrame(() => {
      measureAndApplyWordMasks(this.wordMeasurements, this.wordFadeWidth, this.lines);
    });

    // 重置时间状态，避免残留旧歌的播放时间影响新歌词定位
    this.pendingPlayTime = -1;
    this.lastProcessedTime = -1;
    // 重置帧时间戳，避免渲染器空闲后首帧 deltaTime 过大导致弹簧瞬移
    this.lastFrameTimestamp = 0;

    // 初始布局 + 入场动画
    this.handleSeek(seekTime);
    // 初始定位时副行展开进度直接对齐目标，入场期间不延迟浮现
    for (let i = 1; i < this.lines.length; i++) {
      if (!this.lines[i]?.isBG) continue;
      this.bgExpandValues[i] = this.activeLineSet.has(i) ? 1 : 0;
    }
    this.syncBgProgress();
    this.calculateLayout(true);
    this.playEntranceAnimation(this.containerHeight * 0.6);
    this.needsFullSync = true;
  };

  /**
   * 推送当前播放时间
   * @param timeMs - 当前播放时间
   */
  setCurrentTime = (timeMs: number) => {
    this.pendingPlayTime = timeMs;
  };

  /**
   * 设置播放/暂停状态
   * @param playing - 是否正在播放
   */
  setPlaying = (playing: boolean) => {
    if (this.isPlaying === playing) return;
    this.isPlaying = playing;

    // 暂停/恢复所有激活行的动画
    if (playing) this.lineAnimations.realignActive(this.lines, this.lastProcessedTime);
    else this.lineAnimations.pauseActive();

    this.calculateLayout(false, true);
    this.needsFullSync = true;
  };

  /**
   * 更新渲染器配置
   * @param config - 部分配置项
   */
  setConfig = (config: Partial<RendererConfig>) => {
    this.applyConfig(config);
  };

  /**
   * 应用配置
   * @param config - 部分配置项
   */
  private applyConfig = (config: Partial<RendererConfig>) => {
    let layoutDirty = false;
    let playbackChanged = false;
    let animationOptionsChanged = false;
    if (config.alignPosition != null && config.alignPosition !== this.alignPosition) {
      this.alignPosition = config.alignPosition;
      layoutDirty = true;
    }
    if (config.playing != null && config.playing !== this.isPlaying) {
      this.isPlaying = config.playing;
      playbackChanged = true;
      layoutDirty = true;
    }
    if (config.wordFadeWidth != null && config.wordFadeWidth !== this.wordFadeWidth) {
      this.wordFadeWidth = config.wordFadeWidth;
      if (this.lineElements.length > 0)
        measureAndApplyWordMasks(this.wordMeasurements, this.wordFadeWidth, this.lines);
    }
    if (config.onLineClick !== undefined) this.lineClickCallback = config.onLineClick ?? null;
    if (config.springConfig) {
      this.springParams = config.springConfig;
      this.applySpringParams();
    }
    if (config.scrollResetDelay != null) this.scrollResetDelay = config.scrollResetDelay;
    if (config.minInterludeGap != null) this.minInterludeGap = config.minInterludeGap;
    if (config.breatheCycleTarget != null) this.breatheCycleTarget = config.breatheCycleTarget;
    if (config.inactiveAlpha != null) this.inactiveAlpha = config.inactiveAlpha;
    if (config.hidePassedLines != null) this.hidePassedLines = config.hidePassedLines;
    if (config.enableBlur != null) this.enableBlur = config.enableBlur;
    let domRebuildNeeded = false;
    let needPrerollUpdate = false;

    if (config.enableWordHighlight != null) this.enableWordHighlight = config.enableWordHighlight;
    if (
      config.enableFloatAnimation != null &&
      config.enableFloatAnimation !== this.enableFloatAnimation
    ) {
      this.enableFloatAnimation = config.enableFloatAnimation;
      animationOptionsChanged = true;
    }
    if (
      config.enableEmphasizeEffect != null &&
      config.enableEmphasizeEffect !== this.enableEmphasizeEffect
    ) {
      this.enableEmphasizeEffect = config.enableEmphasizeEffect;
      domRebuildNeeded = true;
    }
    if (config.enableScale != null && config.enableScale !== this.enableScale) {
      this.enableScale = config.enableScale;
      layoutDirty = true;
    }
    if (config.showTranslation != null && config.showTranslation !== this.showTranslation) {
      this.showTranslation = config.showTranslation;
      domRebuildNeeded = true;
    }
    if (config.showRomanization != null && config.showRomanization !== this.showRomanization) {
      this.showRomanization = config.showRomanization;
      domRebuildNeeded = true;
    }
    if (
      config.showWordRomanization != null &&
      config.showWordRomanization !== this.showWordRomanization
    ) {
      this.showWordRomanization = config.showWordRomanization;
      domRebuildNeeded = true;
    }
    if (config.showRuby != null && config.showRuby !== this.showRuby) {
      this.showRuby = config.showRuby;
      domRebuildNeeded = true;
    }
    if (config.bgAlwaysBelow != null && config.bgAlwaysBelow !== this.bgAlwaysBelow) {
      this.bgAlwaysBelow = config.bgAlwaysBelow;
      domRebuildNeeded = true;
    }
    if (
      config.enableScrollPreroll != null &&
      config.enableScrollPreroll !== this.enableScrollPreroll
    ) {
      this.enableScrollPreroll = config.enableScrollPreroll;
      needPrerollUpdate = true;
    }
    if (config.scrollPrerollOptions != null) {
      this.scrollPrerollOptions = {
        ...this.scrollPrerollOptions,
        ...config.scrollPrerollOptions,
      };
      if (this.enableScrollPreroll) needPrerollUpdate = true;
    }
    if (needPrerollUpdate && this.rawLines.length > 0) {
      this.lines = this.enableScrollPreroll
        ? applyScrollPreroll(this.rawLines, this.scrollPrerollOptions)
        : this.rawLines.map((line) => ({ ...line }));
      domRebuildNeeded = true;
    }
    if (config.seekBackwardThreshold != null) {
      this.seekBackwardThreshold = config.seekBackwardThreshold;
    }
    if (config.seekForwardThreshold != null) {
      this.seekForwardThreshold = config.seekForwardThreshold;
    }
    if (
      config.emphasizeMinDuration != null &&
      config.emphasizeMinDuration !== this.emphasizeMinDuration
    ) {
      this.emphasizeMinDuration = Math.max(0, config.emphasizeMinDuration);
      domRebuildNeeded = true;
    }

    if (domRebuildNeeded && this.lines.length > 0) {
      this.rebuildDomInPlace();
      return;
    }

    if (animationOptionsChanged && this.lines.length > 0) {
      this.recreateActiveAnimations();
    } else if (playbackChanged) {
      if (this.isPlaying) this.lineAnimations.realignActive(this.lines, this.lastProcessedTime);
      else this.lineAnimations.pauseActive();
    }

    if (layoutDirty && this.lineElements.length > 0) {
      this.measureLineHeights();
      this.calculateLayout(false);
      this.needsFullSync = true;
    }
  };

  /** 按当前时间和效果开关重建激活行的动画集合 */
  private recreateActiveAnimations = () => {
    for (const lineIdx of this.activeLineSet) {
      const line = this.lines[lineIdx];
      if (!line) continue;
      this.lineAnimations.activate(
        lineIdx,
        line,
        this.lineAnimTargets[lineIdx],
        Math.max(line.startTime, this.lastProcessedTime),
        {
          playing: this.isPlaying,
          float: this.enableFloatAnimation,
          emphasize: this.enableEmphasizeEffect,
        },
      );
    }
  };

  /** 原地热重构歌词 DOM */
  private rebuildDomInPlace = () => {
    if (this.lines.length === 0) return;
    // 取消旧的 Web Animations 动画实例
    this.lineAnimations.cancelAll();
    // 移除旧的行 DOM 元素
    for (const element of this.lineElements) element.remove();
    // 构建新的 DOM 结构
    const built = buildLineElements(this.lines, {
      enableEmphasizeEffect: this.enableEmphasizeEffect,
      emphasizeMinDuration: this.emphasizeMinDuration,
      showTranslation: this.showTranslation,
      showRomanization: this.showRomanization,
      showWordRomanization: this.showWordRomanization,
      showRuby: this.showRuby,
      bgAlwaysBelow: this.bgAlwaysBelow,
    });
    this.lineElements = built.lineElements;
    this.wordMeasurements = built.wordMeasurements;
    this.lineAnimTargets = built.lineAnimTargets;
    this.isBgAbove = built.isBgAbove;
    this.innerElement.appendChild(built.fragment);
    // 恢复对唱标记与当前激活行的 active 类与 Web Animations
    this.container.classList.toggle(
      "lp-has-duet",
      this.lines.some((line) => line.isDuet),
    );
    for (const lineIdx of this.activeLineSet) {
      this.lineElements[lineIdx]?.classList.add("active");
    }
    this.recreateActiveAnimations();
    // 更新哨兵观察器
    this.sentinelResizeObserver.disconnect();
    this.sentinelElement = null;
    if (this.lineElements.length > 0) {
      this.sentinelElement = this.lineElements[0];
      this.sentinelResizeObserver.observe(this.sentinelElement);
    }
    // 重新测量行高并计算掩码
    this.measureLineHeights();
    measureAndApplyWordMasks(this.wordMeasurements, this.wordFadeWidth, this.lines);
    // 清理缓存并将当前弹簧物理坐标即时写回新 DOM，杜绝白屏与位置跳变
    this.cachedTransforms.fill("");
    this.cachedAlphaKeys.fill("");
    this.cachedBlurKeys.fill("");
    this.cachedPassKeys.fill("");
    this.cachedBgKeys.fill("");
    this.cachedTimeString = "";
    // 立即同步 transform 与模糊样式
    const lineCount = this.lines.length;
    for (let i = 0; i < lineCount; i++) {
      const lineEl = this.lineElements[i];
      if (!lineEl) continue;
      // 背景行浮层随主行移动，不写入独立位移
      if (this.lines[i].isBG) continue;
      const y = this.positionSprings[i]?.getCurrentPosition() ?? 0;
      const s = (this.scaleSprings[i]?.getCurrentPosition() ?? 100) / 100;
      const tf = `translateY(${y.toFixed(2)}px) scale(${s.toFixed(4)})`;
      this.cachedTransforms[i] = tf;
      lineEl.style.transform = tf;
      // 新节点需要重新同步合成层与视口裁剪状态
      const inView = y >= -500 && y <= this.containerHeight + 500;
      this.lineWillChange[i] = inView;
      this.lineCulled[i] = false;
      lineEl.style.willChange = inView ? "transform, filter" : "";
      // 同步模糊缓存与样式
      const blur = this.blurValues[i] || 0;
      if (blur > 0.01) {
        lineEl.style.filter = `blur(${(blur * 1.5).toFixed(2)}px)`;
        this.cachedBlurKeys[i] = blur.toFixed(2);
      }
    }
    // 恢复当前激活行的 --t 时间驱动变量
    if (this.enableWordHighlight && this.lastProcessedTime >= 0) {
      const timeStr = String(this.lastProcessedTime);
      this.cachedTimeString = timeStr;
      for (const lineIdx of this.activeLineSet) {
        this.lineElements[lineIdx]?.style.setProperty("--t", timeStr);
      }
    }
    // 立即同步视觉透明度（--ba, --da, --pass）
    this.snapVisualState();
    // 平滑重算布局
    this.calculateLayout(false);
    this.needsFullSync = true;
  };

  /** 测量所有行的 offsetHeight 并缓存到 lineHeights */
  private measureLineHeights = () => {
    for (let i = 0; i < this.lineElements.length; i++) {
      this.lineHeights[i] = this.lineElements[i]?.offsetHeight || 40;
    }
  };

  /**
   * 处理播放时间变化，检测激活行的增减
   * 自动识别 seek：时间倒退 >seekBackwardThreshold 或前进 >seekForwardThreshold
   * @param currentTime - 当前播放时间（毫秒）
   * @returns 是否发生了激活行变化
   */
  private processTime = (currentTime: number): boolean => {
    const isFirst = this.lastProcessedTime < 0;
    const isSeeked =
      !isFirst &&
      (currentTime < this.lastProcessedTime - this.seekBackwardThreshold ||
        currentTime > this.lastProcessedTime + this.seekForwardThreshold);
    this.lastProcessedTime = currentTime;

    if (isFirst || isSeeked) {
      const snap = this.snapNextSeek;
      this.snapNextSeek = false;
      this.handleSeek(currentTime, snap);
      return true;
    }
    // 恢复后的首次推送未发生跳变
    this.snapNextSeek = false;

    const lines = this.lines;
    const activated = this.activatedBuffer;
    const deactivated = this.deactivatedBuffer;
    activated.length = 0;
    deactivated.clear();
    let bgTransition = false;

    // 检测新激活的行（背景行跟随主行生命周期，不独立触发激活）
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.isBG || this.activeLineSet.has(i)) continue;

      if (line.startTime <= currentTime && line.endTime > currentTime) {
        activated.push(i);
        if (lines[i + 1]?.isBG) {
          activated.push(i + 1);
          bgTransition = true;
        }
      }
    }

    // 检测需要停用的行
    for (const lineIdx of this.activeLineSet) {
      const line = lines[lineIdx];
      if (!line) {
        deactivated.add(lineIdx);
        continue;
      }
      // 背景行由配对主行统一联动停用，避免反查时序延迟
      if (line.isBG) continue;

      if (line.startTime > currentTime || line.endTime <= currentTime) {
        deactivated.add(lineIdx);
        if (lines[lineIdx + 1]?.isBG) {
          deactivated.add(lineIdx + 1);
          bgTransition = true;
        }
      }
    }

    if (activated.length === 0 && deactivated.size === 0) return false;

    // 执行停用/激活
    for (const lineIdx of deactivated) {
      this.activeLineSet.delete(lineIdx);
      this.lineElements[lineIdx]?.classList.remove("active");
      this.lineAnimations.deactivate(lineIdx);
    }
    for (const lineIdx of activated) {
      this.activeLineSet.add(lineIdx);
      this.lineElements[lineIdx]?.classList.add("active");
      this.activateLineAnimations(lineIdx, currentTime);
    }

    if (this.activeLineSet.size > 0) this.activeLineIndex = setMin(this.activeLineSet);
    // 副行开合时跳过级联延迟，行组让位弹簧与浮层淡入同时起步
    this.calculateLayout(false, bgTransition);
    return true;
  };

  /**
   * 处理 seek
   * @param targetTime - 跳转目标时间（毫秒）
   * @param snap - true 时布局与透明度直接瞬移到目标状态（用于隐藏/冻结恢复）
   */
  private handleSeek = (targetTime: number, snap = false) => {
    this.userScrollOffset = 0;
    this.isUserScrolling = false;
    clearTimeout(this.scrollResetTimerId);

    // 停用所有当前激活行
    for (const lineIdx of this.activeLineSet) {
      this.lineElements[lineIdx]?.classList.remove("active");
      this.lineAnimations.deactivate(lineIdx);
    }
    this.activeLineSet.clear();

    // 扫描并激活目标时间对应的行
    const lines = this.lines;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.isBG) continue;

      if (line.startTime <= targetTime && targetTime < line.endTime) {
        this.activeLineSet.add(i);
        this.lineElements[i]?.classList.add("active");
        this.activateLineAnimations(i, targetTime);
        if (lines[i + 1]?.isBG) {
          this.activeLineSet.add(i + 1);
          this.lineElements[i + 1]?.classList.add("active");
          this.activateLineAnimations(i + 1, targetTime);
        }
      }
    }

    if (this.activeLineSet.size > 0) {
      this.activeLineIndex = setMin(this.activeLineSet);
    } else {
      // 无激活行时，定位到下一个未来行
      const futureIdx = lines.findIndex((line) => line.startTime >= targetTime);
      this.activeLineIndex = futureIdx === -1 ? lines.length : futureIdx;
    }

    // seek 走渐进淡入：副行展开进度保持当前值，由帧循环插值到目标
    this.calculateLayout(snap, true);
    if (snap) this.snapVisualState();
  };

  /**
   * 将所有行的透明度 / pass 直接同步到目标值
   * 视口裁剪会让屏外行的插值冻结在旧值（如长期保持激活态的高亮），
   * 隐藏/冻结恢复后的瞬移布局可能把这些行直接带回视口，需一次性对齐
   */
  private snapVisualState = () => {
    const doPass = this.hidePassedLines && this.isPlaying;
    const activeIdx = this.activeLineIndex;
    for (let i = 0; i < this.lines.length; i++) {
      const lineEl = this.lineElements[i];
      if (!lineEl) continue;
      const isActive = this.activeLineSet.has(i);
      const isPassed =
        doPass && !isActive && (this.lines[i].isBG ? i - 1 < activeIdx : i < activeIdx);
      const bright = isPassed ? 0.0001 : isActive ? 1.0 : this.inactiveAlpha;
      const dark = isPassed ? 0.0001 : this.enableWordHighlight ? this.inactiveAlpha : bright;
      this.alphaValues[i * 2] = bright;
      this.alphaValues[i * 2 + 1] = dark;
      const brightStr = bright.toFixed(3);
      const darkStr = dark.toFixed(3);
      const alphaKey = brightStr + darkStr;
      if (this.cachedAlphaKeys[i] !== alphaKey) {
        this.cachedAlphaKeys[i] = alphaKey;
        lineEl.style.setProperty("--ba", brightStr);
        lineEl.style.setProperty("--da", darkStr);
      }
      const pass = isPassed ? 0.0001 : 1;
      this.passValues[i] = pass;
      const passKey = pass.toFixed(3);
      if (this.cachedPassKeys[i] !== passKey) {
        this.cachedPassKeys[i] = passKey;
        lineEl.style.setProperty("--pass", passKey);
      }
    }
    // 副行展开量瞬移（隐藏/冻结恢复、热重构时避免让位过渡）
    for (let i = 1; i < this.lines.length; i++) {
      if (!this.lines[i]?.isBG) continue;
      this.bgExpandValues[i] = this.activeLineSet.has(i) ? 1 : 0;
    }
    this.syncBgProgress();
  };

  /** 把副行展开进度写入浮层元素，驱动 CSS 显隐与位移；写在浮层而非宿主，缩小逐帧样式失效范围 */
  private syncBgProgress = () => {
    for (let i = 1; i < this.lines.length; i++) {
      if (!this.lines[i]?.isBG) continue;
      const key = (this.bgExpandValues[i] || 0).toFixed(3);
      if (this.cachedBgKeys[i] === key) continue;
      this.cachedBgKeys[i] = key;
      this.lineElements[i]?.style.setProperty("--lp-bg-progress", key);
    }
  };

  /**
   * 计算所有行的目标位置和缩放
   * @param syncImmediate - true 瞬移到目标位置，false 弹簧动画过渡
   * @param noCascade - true 跳过级联延迟，所有行同步运动（用于 seek 与副行开合）
   */
  private calculateLayout = (syncImmediate: boolean, noCascade = false) => {
    const viewHeight = this.containerHeight;
    const viewWidth = this.containerWidth;
    const currentTime = this.lastProcessedTime;
    const targetIdx = this.activeLineIndex;
    const lines = this.lines;
    const lineCount = this.positionSprings.length;
    if (lineCount === 0) return;

    // 间奏检测
    const interlude = detectInterlude(currentTime, targetIdx, lines, this.minInterludeGap);
    const dotsGap = 10;
    if (interlude) {
      this.interludeState.startTime = interlude[0];
      this.interludeState.endTime = interlude[1];
      this.interludeState.isActive = true;
    } else {
      this.interludeState.isActive = false;
    }

    // 计算激活行之前的累计高度，确定起始位置
    // 主行是排版单元；副行激活时立即占满整槽（相邻行弹簧一次让位），未激活不计入
    let position = -this.userScrollOffset;
    let heightAccum = 0;
    for (let i = 0; i < targetIdx; i++) {
      const line = lines[i];
      if (!line || line.isBG) continue;
      heightAccum += this.lineHeights[i] || 40;
      if (lines[i + 1]?.isBG && this.activeLineSet.has(i + 1)) {
        heightAccum += this.lineHeights[i + 1] || 40;
      }
    }
    position -= heightAccum;
    position += viewHeight * this.alignPosition - (this.lineHeights[targetIdx] || 40) / 2;

    // 级联延迟：越远离激活行的行延迟越小，产生波浪效果
    let cascadeDelay = 0;
    let baseDelay = syncImmediate || noCascade ? 0 : 50;
    let dotsInserted = false;

    for (let i = 0; i < lineCount; i++) {
      const line = lines[i];
      if (!line) continue;
      // 副行随其主行组参与布局，自身不单独推进
      if (line.isBG) continue;

      // 间奏圆点占位
      if (!dotsInserted && interlude && i === interlude[2] + 1) {
        dotsInserted = true;
        position += dotsGap;
        const isDuet = interlude[3];
        this.interludeState.x = isDuet ? viewWidth - this.dotsContainerWidth : 0;
        this.interludeState.y = position;
        this.interludeState.alignRight = isDuet;
        // 锚定到下一歌词行
        this.interludeState.anchorIndex = i;
        this.interludeState.anchorOffset = -(this.dotsContainerHeight + dotsGap);
        position += this.dotsContainerHeight + dotsGap;
      }

      const isActive = this.activeLineSet.has(i);
      const targetScale = this.enableScale && !isActive ? 97 : 100;
      const bg = lines[i + 1];
      const bgOpen = bg?.isBG ? this.activeLineSet.has(i + 1) : false;
      const bgH = bgOpen ? this.lineHeights[i + 1] || 40 : 0;
      // 上置副行占主行上方槽位，主行被下推；否则主行上方即行组顶部
      const lineY = position + (bgOpen && this.isBgAbove[i + 1] ? bgH : 0);

      // 副行位置弹簧：仅用于掩码/透明度视口判定，位移由嵌套浮层随主行承载
      if (bg?.isBG) {
        const bgSpring = this.positionSprings[i + 1];
        const bgY = this.isBgAbove[i + 1] ? lineY - bgH : lineY + (this.lineHeights[i] || 40);
        if (syncImmediate) bgSpring.setPosition(bgY);
        else bgSpring.setTargetPosition(bgY, cascadeDelay);
      }

      const posSpring = this.positionSprings[i];
      const scaleSpring = this.scaleSprings[i];
      if (syncImmediate) {
        posSpring.setPosition(lineY);
        scaleSpring.setPosition(targetScale);
      } else {
        posSpring.setTargetPosition(lineY, cascadeDelay);
        scaleSpring.setTargetPosition(targetScale, cascadeDelay);
      }

      position += (this.lineHeights[i] || 40) + bgH;

      if (position >= 0 && !this.isUserScrolling) {
        cascadeDelay += baseDelay;
        if (i >= targetIdx) baseDelay /= 1.05;
      }
    }

    // bottom-line（歌词制作者等）紧随末行下方
    const bottomY = position + dotsGap;
    if (syncImmediate) this.bottomLineSpring.setPosition(bottomY);
    else this.bottomLineSpring.setTargetPosition(bottomY, cascadeDelay);
  };

  /**
   * 让视口附近的歌词行从底部同步滑入
   * @param offset - 初始偏移距离（px）
   */
  private playEntranceAnimation = (offset: number) => {
    const minVisibleY = -500;
    const maxVisibleY = this.containerHeight + 500;
    for (let i = 0; i < this.positionSprings.length; i++) {
      if (this.lines[i].isBG) continue;
      const posSpring = this.positionSprings[i];
      const targetY = posSpring.getCurrentPosition();
      if (targetY < minVisibleY || targetY > maxVisibleY) continue;
      posSpring.setPosition(targetY + offset);
      posSpring.setTargetPosition(targetY);
    }

    const bottomTarget = this.bottomLineSpring.getCurrentPosition();
    if (bottomTarget >= minVisibleY && bottomTarget <= maxVisibleY) {
      this.bottomLineSpring.setPosition(bottomTarget + offset);
      this.bottomLineSpring.setTargetPosition(bottomTarget);
    }
  };

  /**
   * rAF 回调
   * @param timestamp - 当前时间戳
   */
  private onAnimationFrame = (timestamp: number) => {
    this.animationFrameId = requestAnimationFrame(this.onAnimationFrame);
    if (!this.isPageVisible) return;

    // 计算帧间隔，并夹紧上限避免 tab 后台 / 长时间冻结后的首帧 deltaTime 过大
    const rawDelta = this.lastFrameTimestamp ? timestamp - this.lastFrameTimestamp : 16;
    const deltaTime = rawDelta > 100 ? 100 : rawDelta;
    this.lastFrameTimestamp = timestamp;

    const lineCount = this.positionSprings.length;
    if (lineCount === 0) return;

    // 消费播放时间，检测激活行变化
    const playTime = this.pendingPlayTime;
    if (playTime >= 0 && playTime !== this.lastProcessedTime) {
      if (this.processTime(playTime)) this.needsFullSync = true;
    }

    // 更新激活行的 --t CSS 变量（驱动逐字掩码位移）
    if (this.enableWordHighlight && playTime >= 0) {
      const timeStr = String(playTime);
      if (timeStr !== this.cachedTimeString) {
        this.cachedTimeString = timeStr;
        for (const lineIdx of this.activeLineSet) {
          this.lineElements[lineIdx]?.style.setProperty("--t", timeStr);
        }
      }
    }

    // 推进弹簧 + 写入 transform
    const viewHeight = this.containerHeight;
    const isFullSync = this.needsFullSync;
    this.needsFullSync = false;

    // 副行展开进度插值：只驱动浮层显隐与折叠；行组占位已按激活态一次让出，无需逐帧重排
    if (this.entranceComplete) {
      const bgFactor = 1 - Math.exp(-12 * ((deltaTime || 16) / 1000));
      let bgDirty = false;
      for (let i = 1; i < lineCount; i++) {
        if (!this.lines[i]?.isBG) continue;
        const target = this.activeLineSet.has(i) ? 1 : 0;
        const cur = this.bgExpandValues[i];
        if (Math.abs(target - cur) < 0.001) {
          if (cur !== target) this.bgExpandValues[i] = target;
          continue;
        }
        this.bgExpandValues[i] = cur + (target - cur) * bgFactor;
        bgDirty = true;
      }
      if (bgDirty) this.syncBgProgress();
    }

    for (let i = 0; i < lineCount; i++) {
      const posSpring = this.positionSprings[i];
      const scaleSpring = this.scaleSprings[i];
      posSpring.update(deltaTime);
      scaleSpring.update(deltaTime);

      // 背景行已收进主行浮层，随主行 DOM 移动：只推进弹簧供掩码视口判定，不写入位移
      if (this.lines[i]?.isBG) continue;

      const yPos = posSpring.getCurrentPosition();
      const scale = scaleSpring.getCurrentPosition() / 100;
      const inView = yPos >= -500 && yPos <= viewHeight + 500;
      // 合成层按需提升：仅视口附近的行挂 will-change
      if (this.lineWillChange[i] !== inView) {
        this.lineWillChange[i] = inView;
        this.lineElements[i].style.willChange = inView ? "transform, filter" : "";
      }
      // 视口裁剪：屏幕外行跳过 transform 写入
      if (!isFullSync && !inView) {
        // 弹簧一帧内飞出裁剪带时，DOM 可能残留在视口内（seek 伪影），
        // 离带首帧按弹簧当前位置写一次终位，确保 DOM 同步移出视口
        if (!this.lineCulled[i]) {
          this.lineCulled[i] = true;
          const culledTransform = `translateY(${yPos.toFixed(1)}px) scale(${scale.toFixed(4)})`;
          this.cachedTransforms[i] = culledTransform;
          this.lineElements[i].style.transform = culledTransform;
        }
        continue;
      }
      this.lineCulled[i] = false;
      const transformStr = `translateY(${yPos.toFixed(1)}px) scale(${scale.toFixed(4)})`;
      if (this.cachedTransforms[i] !== transformStr) {
        this.cachedTransforms[i] = transformStr;
        this.lineElements[i].style.transform = transformStr;
      }
    }

    // bottom-line 随弹簧平滑移动；无内容或屏外时跳过
    this.bottomLineSpring.update(deltaTime);
    if (this.bottomLineEl.childNodes.length > 0) {
      const bottomY = this.bottomLineSpring.getCurrentPosition();
      const bottomInView = bottomY >= -500 && bottomY <= viewHeight + 500;
      if (this.bottomWillChange !== bottomInView) {
        this.bottomWillChange = bottomInView;
        this.bottomLineEl.style.willChange = bottomInView ? "transform, filter" : "";
      }
      if (!isFullSync && !bottomInView) {
        // 同歌词行：离带首帧写一次终位，防止 DOM 残留在视口内
        if (!this.bottomCulled) {
          this.bottomCulled = true;
          const culledTransform = `translateY(${bottomY.toFixed(1)}px)`;
          this.cachedBottomTransform = culledTransform;
          this.bottomLineEl.style.transform = culledTransform;
        }
      } else {
        this.bottomCulled = false;
        const bottomTransform = `translateY(${bottomY.toFixed(1)}px)`;
        if (this.cachedBottomTransform !== bottomTransform) {
          this.cachedBottomTransform = bottomTransform;
          this.bottomLineEl.style.transform = bottomTransform;
        }
      }
    }

    // 入场完成检测
    if (!this.entranceComplete) {
      let allSettled = true;
      for (let i = 0; i < lineCount; i++) {
        if (!this.positionSprings[i].arrived()) {
          allSettled = false;
          break;
        }
      }
      this.entranceComplete = allSettled;
    }

    // 透明度 / pass / 模糊
    const frameDeltaSec = (deltaTime || 16) / 1000;
    const attackFactor = 1 - Math.exp(-this.alphaAttackSpeed * frameDeltaSec);
    const releaseFactor = 1 - Math.exp(-this.alphaReleaseSpeed * frameDeltaSec);
    const brightenFactor = this.hasWordTiming ? attackFactor : releaseFactor;
    const blurFactor = 1 - Math.exp(-12 * frameDeltaSec);
    const halfInactive = this.inactiveAlpha * 0.5;
    const doPass = this.hidePassedLines && this.isPlaying;
    const doBlur = this.enableBlur;
    const blurSuppressed = this.isUserScrolling || this.isHovering;
    const activeIdx = this.activeLineIndex;

    for (let i = 0; i < lineCount; i++) {
      const yPos = this.positionSprings[i].getCurrentPosition();
      if (!isFullSync && (yPos < -500 || yPos > viewHeight + 500)) continue;

      const isActive = this.activeLineSet.has(i);
      const isPassed =
        doPass &&
        !this.isUserScrolling &&
        !isActive &&
        (this.lines[i].isBG ? i - 1 < activeIdx : i < activeIdx);

      // alpha：亮色（--ba）和暗色（--da）分别插值
      const alphaIdx = i * 2;
      const targetBright = isPassed ? 0.0001 : isActive ? 1.0 : this.inactiveAlpha;
      let brightValue = this.alphaValues[alphaIdx];
      if (Math.abs(targetBright - brightValue) < 0.001) {
        brightValue = targetBright;
      } else {
        const factor =
          !isPassed && brightValue < halfInactive
            ? releaseFactor
            : targetBright > brightValue
              ? brightenFactor
              : releaseFactor;
        brightValue += (targetBright - brightValue) * factor;
      }
      this.alphaValues[alphaIdx] = brightValue;

      const targetDark = isPassed
        ? 0.0001
        : this.enableWordHighlight
          ? this.inactiveAlpha
          : targetBright;
      let darkValue = this.alphaValues[alphaIdx + 1];
      if (Math.abs(targetDark - darkValue) < 0.001) {
        darkValue = targetDark;
      } else {
        const factor =
          !isPassed && darkValue < halfInactive
            ? releaseFactor
            : targetDark > darkValue
              ? attackFactor
              : releaseFactor;
        darkValue += (targetDark - darkValue) * factor;
      }
      this.alphaValues[alphaIdx + 1] = darkValue;

      // 缓存对比，仅变化时写入 DOM
      const brightStr = brightValue.toFixed(3);
      const darkStr = darkValue.toFixed(3);
      const alphaKey = brightStr + darkStr;
      if (this.cachedAlphaKeys[i] !== alphaKey) {
        this.cachedAlphaKeys[i] = alphaKey;
        const lineEl = this.lineElements[i];
        lineEl.style.setProperty("--ba", brightStr);
        lineEl.style.setProperty("--da", darkStr);
      }

      // pass：已播放行淡出
      if (doPass || this.passValues[i] < 0.999) {
        const targetPass = isPassed ? 0.0001 : 1;
        let passValue = this.passValues[i];
        if (Math.abs(targetPass - passValue) < 0.001) passValue = targetPass;
        else passValue += (targetPass - passValue) * releaseFactor;
        this.passValues[i] = passValue;
        const passKey = passValue.toFixed(3);
        if (this.cachedPassKeys[i] !== passKey) {
          this.cachedPassKeys[i] = passKey;
          this.lineElements[i].style.setProperty("--pass", passKey);
        }
      }

      // blur：逐行模糊，距激活行越远越模糊
      if (doBlur || this.blurValues[i] > 0.01) {
        let targetBlur = 0;
        if (doBlur && !blurSuppressed && !isActive) {
          targetBlur = Math.min(4, 1 + Math.abs(i - Math.max(activeIdx, 0)));
        }
        let blurCurrent = this.blurValues[i];
        if (Math.abs(targetBlur - blurCurrent) < 0.01) blurCurrent = targetBlur;
        else blurCurrent += (targetBlur - blurCurrent) * blurFactor;
        this.blurValues[i] = blurCurrent;
        const blurKey = blurCurrent.toFixed(2);
        if (this.cachedBlurKeys[i] !== blurKey) {
          this.cachedBlurKeys[i] = blurKey;
          // 仅在确有模糊时挂 filter，归零时移除，避免非模糊行常驻 filter 合成层
          const lineStyle = this.lineElements[i].style;
          if (blurCurrent > 0.01) lineStyle.filter = `blur(${(blurCurrent * 1.5).toFixed(2)}px)`;
          else lineStyle.removeProperty("filter");
        }
      }
    }

    // 间奏圆点 Y 跟随锚定行弹簧
    if (this.interludeState.isActive) {
      const anchorSpring = this.positionSprings[this.interludeState.anchorIndex];
      if (anchorSpring) {
        this.interludeState.y =
          anchorSpring.getCurrentPosition() + this.interludeState.anchorOffset;
      }
    }
    // 间奏圆点呼吸动画
    renderInterludeDots(
      playTime,
      this.interludeState,
      this.dotsContainer,
      this.dotElements,
      this.interludeCache,
      this.breatheCycleTarget,
    );
  };

  /**
   * 为指定行按需创建动画并播放（懒创建：仅在行激活时调用）
   * @param lineIndex - 行索引
   * @param currentTime - 当前播放时间（毫秒）
   */
  private activateLineAnimations = (lineIndex: number, currentTime: number) => {
    this.lineAnimations.activate(
      lineIndex,
      this.lines[lineIndex],
      this.lineAnimTargets[lineIndex],
      currentTime,
      {
        playing: this.isPlaying,
        float: this.enableFloatAnimation,
        emphasize: this.enableEmphasizeEffect,
      },
    );
  };

  /**
   * 歌词行点击
   * @param event - 鼠标事件
   */
  private handleLineClick = (event: MouseEvent) => {
    if (!this.lineClickCallback) return;
    const lineEl = (event.target as HTMLElement).closest(".lp-line") as HTMLDivElement | null;
    if (!lineEl) return;
    const lineIdx = this.lineElements.indexOf(lineEl);
    if (lineIdx !== -1 && this.lines[lineIdx])
      this.lineClickCallback(this.lines[lineIdx].startTime);
  };

  /**
   * 应用用户滚动偏移并设置回弹定时器
   * @param deltaY - 滚动偏移量
   */
  private applyUserScroll = (deltaY: number) => {
    // 首次进入滚动时清理残留动画，减少合成开销
    if (!this.isUserScrolling) this.lineAnimations.cleanupInactive();
    this.userScrollOffset += deltaY;
    this.isUserScrolling = true;
    this.calculateLayout(false);
    clearTimeout(this.scrollResetTimerId);
    this.scrollResetTimerId = window.setTimeout(() => {
      this.isUserScrolling = false;
      this.userScrollOffset = 0;
      this.calculateLayout(false);
    }, this.scrollResetDelay);
  };

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.applyUserScroll(event.deltaY);
  };

  private handleTouchStart = (event: TouchEvent) => {
    this.lastTouchY = event.touches[0].clientY;
  };

  private handleTouchMove = (event: TouchEvent) => {
    event.preventDefault();
    const currentY = event.touches[0].clientY;
    this.applyUserScroll(this.lastTouchY - currentY);
    this.lastTouchY = currentY;
  };

  private handleTouchEnd = () => {
    if (!this.isUserScrolling) return;
    clearTimeout(this.scrollResetTimerId);
    this.scrollResetTimerId = window.setTimeout(() => {
      this.isUserScrolling = false;
      this.userScrollOffset = 0;
      this.calculateLayout(false);
    }, this.scrollResetDelay);
  };

  private handleMouseEnter = () => {
    this.isHovering = true;
  };

  /** 鼠标离开：恢复模糊 + 回弹滚动位置 */
  private handleMouseLeave = () => {
    this.isHovering = false;
    if (this.isUserScrolling) {
      clearTimeout(this.scrollResetTimerId);
      this.isUserScrolling = false;
      this.userScrollOffset = 0;
      this.calculateLayout(false, true);
    }
  };

  /** 容器尺寸变化：重新测量 + 重算掩码 + 重新布局 */
  private handleContainerResize = () => {
    const newWidth = this.container.clientWidth;
    const newHeight = this.container.clientHeight;
    if (newWidth === this.containerWidth && newHeight === this.containerHeight) return;
    this.containerWidth = newWidth;
    this.containerHeight = newHeight;
    this.measureLineHeights();
    measureAndApplyWordMasks(this.wordMeasurements, this.wordFadeWidth, this.lines);
    // 入场动画期间跳过 calculateLayout，避免 setPosition 瞬移破坏弹簧入场
    if (!this.entranceComplete) {
      this.needsFullSync = true;
      return;
    }
    this.calculateLayout(true);
    this.needsFullSync = true;
  };

  /** 哨兵行尺寸变化（字体/样式变化时触发） */
  private handleSentinelResize = () => {
    if (this.lineElements.length === 0) return;
    this.dotsContainerWidth = this.dotsContainer.offsetWidth || 60;
    this.dotsContainerHeight = this.dotsContainer.offsetHeight || 20;
    this.measureLineHeights();
    measureAndApplyWordMasks(this.wordMeasurements, this.wordFadeWidth, this.lines);
    // 入场动画期间跳过 calculateLayout，避免 setPosition 瞬移破坏弹簧入场
    if (!this.entranceComplete) {
      this.needsFullSync = true;
      return;
    }
    this.calculateLayout(true);
    this.needsFullSync = true;
  };

  /** 取 bottom-line 容器 */
  getBottomLineElement = (): HTMLElement => this.bottomLineEl;

  /** 页面可见性变化：不可见时跳过渲染，恢复时清理残留动画并等待新的时间推送重新对齐 */
  private handleVisibilityChange = () => {
    this.isPageVisible = !document.hidden;
    if (!this.isPageVisible) return;
    if (this.animationFrameId === 0) return;
    this.lastFrameTimestamp = 0;
    // 隐藏期间缓冲的歌词此刻应用，内部完成测量、布局与动画清理
    if (this.pendingHiddenLyrics) {
      const pendingLines = this.pendingHiddenLyrics;
      this.pendingHiddenLyrics = null;
      this.setLyrics(pendingLines);
      this.snapNextSeek = true;
      return;
    }
    this.lineAnimations.cleanupInactive();
    this.measureLineHeights();
    if (this.entranceComplete) this.calculateLayout(true);
    // 检测到跳变则瞬移布局，避免旧歌词行残留
    this.snapNextSeek = true;
    this.needsFullSync = true;
  };

  /** 将当前弹簧参数应用到位置弹簧 */
  private applySpringParams = () => {
    const config = this.springParams;
    for (const spring of this.positionSprings) spring.updateParams(config);
    this.bottomLineSpring.updateParams(config);
  };
}
