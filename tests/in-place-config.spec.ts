import { describe, expect, it } from "vitest";
import { LyricRenderer } from "../src";
import type { LyricLine } from "../src/types";

describe("setConfig 原地热更新 (In-place Hot Update)", () => {
  it("切换翻译开关时原地更新 DOM，不重建物理弹簧且保留激活状态", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const renderer = new LyricRenderer(container, {
      showTranslation: true,
      showRomanization: false,
    });

    const lines: LyricLine[] = [
      {
        startTime: 1000,
        endTime: 3000,
        words: [{ startTime: 1000, endTime: 3000, word: "Hello" }],
        translatedLyric: "你好",
        romanLyric: "",
        isBG: false,
        isDuet: false,
      },
      {
        startTime: 3000,
        endTime: 5000,
        words: [{ startTime: 3000, endTime: 5000, word: "World" }],
        translatedLyric: "世界",
        romanLyric: "",
        isBG: false,
        isDuet: false,
      },
    ];

    renderer.setLyrics(lines);

    // 内部私有属性检查（通过 any 断言）
    const engine = renderer as unknown as {
      positionSprings: unknown[];
      activeLineIndex: number;
      lineElements: HTMLElement[];
      lineWillChange: boolean[];
      processTime: (t: number) => boolean;
    };

    // 模拟推进时间到 1500ms
    engine.processTime(1500);
    expect(engine.lineElements[0]?.classList.contains("active")).toBe(true);

    // 记录热更新前的弹簧实例引用与激活行
    const originalSprings = [...engine.positionSprings];
    const oldLineElement = engine.lineElements[0];
    expect(container.querySelectorAll(".lp-sub").length).toBe(2);

    // 切换关闭翻译
    renderer.setConfig({ showTranslation: false });

    // 验证 DOM 中的翻译已被移除
    expect(container.querySelectorAll(".lp-sub").length).toBe(0);

    // 验证弹簧实例被原样保留，没有被全量重新分配（引用一致）
    expect(engine.positionSprings.length).toBe(originalSprings.length);
    for (let i = 0; i < originalSprings.length; i++) {
      expect(engine.positionSprings[i]).toBe(originalSprings[i]);
    }

    // 验证新创建的 DOM 元素上保留了 active 类
    expect(engine.lineElements[0]?.classList.contains("active")).toBe(true);
    // 新 DOM 必须重新获得真实的合成层提示，不能沿用旧节点的 lineWillChange 缓存。
    expect(engine.lineElements[0]).not.toBe(oldLineElement);
    expect(engine.lineWillChange[0]).toBe(true);
    expect(engine.lineElements[0]?.style.willChange).toBe("transform, filter");

    renderer.dispose();
  });

  it("动态开启逐字音译时原地热更新，行音译自动退场且弹簧保留", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const renderer = new LyricRenderer(container, {
      showRomanization: true,
      showWordRomanization: false,
    });

    const lines: LyricLine[] = [
      {
        startTime: 1000,
        endTime: 3000,
        words: [
          { startTime: 1000, endTime: 2000, word: "桜", romanWord: "sakura" },
          { startTime: 2000, endTime: 3000, word: "色", romanWord: "iro" },
        ],
        translatedLyric: "",
        romanLyric: "sakura iro",
        isBG: false,
        isDuet: false,
      },
    ];

    renderer.setLyrics(lines);

    const engine = renderer as unknown as {
      positionSprings: unknown[];
    };
    const initialSpring = engine.positionSprings[0];

    // 初始展示行音译，无逐字音译
    expect(container.querySelectorAll(".lp-sub").length).toBe(1);
    expect(container.querySelectorAll(".lp-roman-word").length).toBe(0);

    // 动态开启逐字音译
    renderer.setConfig({ showWordRomanization: true });

    // 原地更新为逐字音译，行音译隐藏
    expect(container.querySelectorAll(".lp-roman-word").length).toBe(2);
    expect(container.querySelectorAll(".lp-sub").length).toBe(0);

    // 弹簧未被重建
    expect(engine.positionSprings[0]).toBe(initialSpring);

    renderer.dispose();
  });

  it("播放暂停切换时，保持行的缩放目标不变，避免逐行放大抖动", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const renderer = new LyricRenderer(container);
    const lines: LyricLine[] = [
      {
        startTime: 1000,
        endTime: 3000,
        words: [{ startTime: 1000, endTime: 3000, word: "Line 1" }],
        translatedLyric: "",
        romanLyric: "",
        isBG: false,
        isDuet: false,
      },
      {
        startTime: 3000,
        endTime: 5000,
        words: [{ startTime: 3000, endTime: 5000, word: "Line 2" }],
        translatedLyric: "",
        romanLyric: "",
        isBG: false,
        isDuet: false,
      },
    ];

    renderer.setLyrics(lines);
    renderer.setPlaying(true);
    renderer.setCurrentTime(2000);

    const engine = renderer as unknown as {
      processTime: (t: number) => boolean;
      scaleSprings: Array<{ getTargetPosition: () => number }>;
    };
    engine.processTime(2000);

    // 第一行激活（scale 100），第二行非激活（scale 97）
    expect(engine.scaleSprings[0].getTargetPosition()).toBe(100);
    expect(engine.scaleSprings[1].getTargetPosition()).toBe(97);

    // 暂停播放
    renderer.setPlaying(false);

    // 缩放目标依然保持稳定，不会跳回 100 触发波浪放大
    expect(engine.scaleSprings[0].getTargetPosition()).toBe(100);
    expect(engine.scaleSprings[1].getTargetPosition()).toBe(97);

    // 恢复播放并进入两句之间的间隔（t=5000，第一行已结束，第二行未开始）
    renderer.setPlaying(true);
    engine.processTime(5000);
    // 第一行唱完恢复 97，第二行未开始保持 97，绝不会全体弹回 100
    expect(engine.scaleSprings[0].getTargetPosition()).toBe(97);
    expect(engine.scaleSprings[1].getTargetPosition()).toBe(97);

    // 动态关闭歌词缩放效果
    renderer.setConfig({ enableScale: false });
    expect(engine.scaleSprings[0].getTargetPosition()).toBe(100);
    expect(engine.scaleSprings[1].getTargetPosition()).toBe(100);

    renderer.dispose();
  });
});
