# lyric-dom

基于原生 DOM API 构建的无运行时依赖、跨框架浏览器端卡拉OK歌词渲染引擎。

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](#)
[![Zero Dependency](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#)

[English](README.md) | 简体中文

## 安装

```bash
pnpm add lyric-dom
# 或
npm install lyric-dom
```

## 快速上手

### 基础用法

导入渲染器类与样式表：

```ts
import { LyricRenderer, applyScrollPreroll } from "lyric-dom";
import "lyric-dom/renderer.css";

const container = document.querySelector<HTMLDivElement>("#lyrics")!;

const renderer = new LyricRenderer(container, {
  playing: true,
  alignPosition: 0.35,
  onLineClick: (timeMs) => {
    player.seek(timeMs);
  },
});

// 设置歌词数据（applyScrollPreroll 会在开唱前适当提前行滚动时机，使视野切换更平滑自然）
renderer.setLyrics(applyScrollPreroll(lines));
```

### 播放同步与进度控制

在每帧动画循环或音频 `timeupdate` 事件中推送当前播放进度：

```ts
// 推送当前播放进度（毫秒）
renderer.setCurrentTime(currentTimeMs);

// 切换播放 / 暂停状态
renderer.setPlaying(isPlaying);
```

### 资源管理与页面可见性

```ts
// 在隐藏或后台运行时冻结渲染循环（如后台标签页或不可见窗口，降低 CPU/GPU 开销）
renderer.freeze();

// 恢复至前台可见时重新开始渲染循环并自动校准同步
renderer.resume();

// 销毁渲染器实例，清理 DOM 节点、动画与事件监听器
renderer.dispose();
```

### 底部信息行与拓展内容

在最后一行歌词下方添加歌曲制作人员、演职员信息或留白容器：

```ts
const bottomEl = renderer.getBottomLineElement();
bottomEl.textContent = "作词: ... / 作曲: ...";
```

### CSS 变量与主题定制

通过 CSS 自定义属性灵活定制主题颜色、字体大小与布局间距：

```css
#lyrics {
  --lp-color: #ffffff;
  --lp-padding-x: 1.5em;
  --lp-duet-color: #38bdf8;
  --lp-sub-opacity: 0.4;
  --lp-dot-size: 0.45em;
}
```

---

## API 参考

### `LyricRenderer`

#### `new LyricRenderer(container, config?)`

- **`container`**: `HTMLElement` - 挂载渲染器的 DOM 容器元素。
- **`config?`**: `Partial<RendererConfig>` - 可选的初始配置项。

#### 方法列表

| 方法 | 参数 | 说明 |
| :--- | :--- | :--- |
| `setLyrics(lines)` | `lines: LyricLine[]` | 设置歌词数据，重新测量构建 DOM 结构并播放入场动画。 |
| `setCurrentTime(timeMs)` | `timeMs: number` | 推送当前播放时间戳（毫秒）。 |
| `setPlaying(playing)` | `playing: boolean` | 设置播放 / 暂停状态；暂停或恢复激活行的逐字染色动画。 |
| `setConfig(config)` | `config: Partial<RendererConfig>` | 动态更新渲染器配置项。 |
| `freeze()` | - | 挂起 requestAnimationFrame 渲染循环并断开尺寸监听（节省后台资源）。 |
| `resume()` | - | 恢复 requestAnimationFrame 渲染循环、重新监听尺寸并对齐动画状态。 |
| `getBottomLineElement()` | - | 获取位于最末行歌词下方的底部容器元素（`.lp-credit`）。 |
| `dispose()` | - | 彻底销毁渲染器实例，终止所有动画并清理 DOM 节点与事件监听器。 |

### `RendererConfig`

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `alignPosition` | `number` | `0.35` | 激活行在容器中的垂直对齐位置比例（`0` 到 `1`，`0.35` 表示距顶部 35%）。 |
| `playing` | `boolean` | `true` | 当前播放状态。 |
| `springConfig` | `Partial<SpringParams>` | `{}` | 自定义弹簧物理参数，用于控制滚动与缩放插值。 |
| `wordFadeWidth` | `number` | `0.5` | 逐字掩码渐变边缘的宽度比例。 |
| `scrollResetDelay` | `number` | `5000` | 用户手动滚动后，自动回弹至激活行的延迟时间（毫秒）。 |
| `minInterludeGap` | `number` | `4000` | 触发间奏呼吸圆点动画的最小空白时长（毫秒）。 |
| `breatheCycleTarget` | `number` | `1500` | 间奏圆点呼吸动画的目标周期时长（毫秒）。 |
| `alphaAttackSpeed` | `number` | `50` | 行激活时的透明度爬升速度。 |
| `alphaReleaseSpeed` | `number` | `7` | 行停用时的透明度衰减速度。 |
| `inactiveAlpha` | `number` | `0.2` | 非激活行的基础透明度。 |
| `hidePassedLines` | `boolean` | `false` | 是否淡出已播放完毕的历史歌词行。 |
| `enableBlur` | `boolean` | `false` | 是否对非激活行启用基于视口距离的高斯模糊效果。 |
| `enableWordHighlight` | `boolean` | `true` | 是否启用逐字卡拉OK染色高亮。 |
| `enableFloatAnimation` | `boolean` | `false` | 是否启用歌词演唱时的逐字轻微上浮动画。 |
| `enableEmphasizeEffect` | `boolean` | `false` | 是否为长音启用按需创建的强调辉光与形变效果。 |
| `emphasizeMinDuration` | `number` | `1000` | 触发强调辉光所需的最短音节时长（毫秒）。 |
| `showTranslation` | `boolean` | `true` | 是否显示翻译歌词行。 |
| `showRomanization` | `boolean` | `true` | 是否显示罗马音歌词行。 |
| `onLineClick` | `(timeMs: number) => void` | `undefined` | 点击歌词行时的回调函数，参数为该行的起始时间戳（毫秒）。 |

### `SpringParams`

基于阻尼谐振子（Damped Harmonic Oscillator）模型的弹簧动画物理参数：

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `mass` | `number` | `1` | 模拟物体的质量。数值越大惯性越大，加速与振荡越迟钝。 |
| `damping` | `number` | `10` | 摩擦阻尼系数。控制振荡衰减的快慢程度。 |
| `stiffness` | `number` | `100` | 弹簧刚度（回弹力强度）。数值越大回弹到目标位置越迅速。 |
| `soft` | `boolean` | `false` | 为 `true` 时强制启用过阻尼模式（无任何回弹振荡，单调指数衰减）。 |

### 工具函数与常量

#### `applyScrollPreroll(lines)`

提前歌词行的起始时间，使滚动渲染器能够在演唱开始前平滑地将视野滚动就位：

- 无时间重叠的行最高提前 600 ms。
- 存在重叠的对唱行提前量限制在 400 ms 或前一行时长的 30% 以内。

```ts
import { applyScrollPreroll } from "lyric-dom";

renderer.setLyrics(applyScrollPreroll(rawLines));
```

#### `DEFAULTS`

导出的默认配置常量对象，包含 `RendererConfig` 各项的内置默认值。

### CSS 变量

所有样式细节均可通过 CSS 自定义属性进行覆盖定制：

| CSS 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `--lp-color` | `#fff` | 歌词主文本颜色。 |
| `--lp-padding-x` | `1em` | 歌词内部容器的水平内边距。 |
| `--lp-line-padding` | `0.4em 1em` | 歌词单行的内边距。 |
| `--lp-duet-color` | `var(--lp-color, #fff)` | 对唱行歌词文本颜色。 |
| `--lp-duet-indent` | `15%` | 对唱模式下的单侧缩进距离（屏幕宽度 <= 600px 时自动为 `8%`）。 |
| `--lp-bg-font-size` | `0.75em` | 背景和声歌词行（`isBG`）字体大小。 |
| `--lp-bg-active-opacity` | `0.4` | 激活状态下的背景和声歌词透明度。 |
| `--lp-bg-tuck` | `0.85em` | 隐藏时背景浮层收入主行内的下沉距离。 |
| `--lp-hover-bg` | `color-mix(...)` | 鼠标悬停在可点击行时的胶囊高亮背景颜色。 |
| `--lp-sub-font-size` | `max(0.5em, 10px)` | 翻译与罗马音副歌词字体大小。 |
| `--lp-sub-line-height` | `1.5em` | 翻译与罗马音副歌词行高。 |
| `--lp-sub-opacity` | `0.2` | 翻译与罗马音副歌词基础透明度（未设置时跟随 `inactiveAlpha`，含已播行淡出）。 |
| `--lp-sub-color` | `inherit` | 翻译与罗马音副歌词文本颜色。 |
| `--lp-dot-size` | `0.45em` | 间奏呼吸圆点的直径大小。 |
| `--lp-credit-opacity` | `0.3` | 底部演职员信息行的透明度。 |
| `--lyric-font-zh` | `inherit` | 中文语言歌词字族（`:lang(zh)`）。 |
| `--lyric-font-ja` | `inherit` | 日文语言歌词字族（`:lang(ja)`）。 |
| `--lyric-font-ko` | `inherit` | 韩文语言歌词字族（`:lang(ko)`）。 |
| `--lyric-font-latin` | `inherit` | 拉丁文字歌词字族（`:lang(und-Latn)`）。 |

### 数据模型

```ts
type LyricLanguage = "ja" | "ko" | "zh-CN" | "und-Latn";

interface LyricLine {
  language?: LyricLanguage;
  words: LyricWord[];
  translatedLyric: string;
  romanLyric: string;
  startTime: number; // 毫秒 (ms)
  endTime: number;   // 毫秒 (ms)
  isBG: boolean;
  isDuet: boolean;
}

interface LyricWord extends LyricSpan {
  romanWord?: string;
  obscene?: boolean;
  ruby?: LyricSpan[];
}

interface LyricSpan {
  startTime: number; // 毫秒 (ms)
  endTime: number;   // 毫秒 (ms)
  word: string;
}
```

## 致谢

- [amll-dev/applemusic-like-lyrics](https://github.com/amll-dev/applemusic-like-lyrics)
- [SPlayer-Dev/lyric-kit](https://github.com/SPlayer-Dev/lyric-kit)

## 开源协议

[AGPL-3.0](LICENSE) © [SPlayer-Dev](https://github.com/SPlayer-Dev)
