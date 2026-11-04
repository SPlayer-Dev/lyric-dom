import { describe, expect, it } from "vitest";
import { findRubyCollisions } from "../src/engine/ruby-layout";
import { buildWordSpans, measureAndApplyWordMasks } from "../src/engine/word-builder";
import type { LyricWord } from "../src/types";

const rubyWord = (text: string, annotation: string[], start: number, end: number): LyricWord => ({
  word: text,
  startTime: start,
  endTime: end,
  ruby: annotation.map((word) => ({ word, startTime: start, endTime: end })),
});

const build = (showWordRoman = false) => {
  const root = document.createElement("div");
  root.className = "lp-main";
  const built = buildWordSpans(
    [
      rubyWord("光", ["ひかり"], 0, 400),
      { word: "と", startTime: 400, endTime: 600 },
      rubyWord("夜空", ["よ", "ぞら"], 600, 1200),
    ],
    root,
    {
      enableEmphasizeEffect: false,
      emphasizeMinDuration: 1000,
      showRuby: true,
      showWordRoman,
    },
  );
  return { root, built };
};

describe("词内注音排版", () => {
  it("只把溢出回收标记加在直接带注音的单词上", () => {
    const { root } = build();
    const spans = root.querySelectorAll(":scope > span");
    expect(spans[0].className).toBe("lp-ruby-word");
    expect(spans[1].className).toBe("");
    expect(root.querySelectorAll("ruby rt")).toHaveLength(3);
  });

  it("逐字音译下注音仍随文字层渲染，不参与溢出回收", () => {
    const { root } = build(true);
    expect(root.querySelector(".lp-word-text rt")?.textContent).toBe("ひかり");
    expect(root.querySelectorAll(".lp-ruby-word")).toHaveLength(0);
  });

  it("测量后还原假名显示并写出溢出变量", () => {
    const { root, built } = build();
    measureAndApplyWordMasks([built.measurements], 0.2);
    for (const rt of root.querySelectorAll<HTMLElement>("rt")) expect(rt.style.display).toBe("");
    const word = root.querySelector<HTMLElement>(".lp-ruby-word");
    expect(word?.style.getPropertyValue("--lp-ruby-overflow")).toBe("0.00px");
  });
});

const band = (left: number, right: number, top = 0, bottom = 10) => ({ left, right, top, bottom });

describe("注音占位碰撞判定", () => {
  it("同行交叠的假名占位判为碰撞", () => {
    expect(findRubyCollisions([band(0, 40), band(30, 90)])).toEqual(new Set([0, 1]));
  });

  it("交叠量不足最小间距时不算碰撞", () => {
    expect(findRubyCollisions([band(0, 40), band(39.6, 90)])).toEqual(new Set());
  });

  it("不同行的占位不算碰撞", () => {
    expect(findRubyCollisions([band(0, 40, 0, 10), band(10, 50, 20, 30)])).toEqual(new Set());
  });

  it("链式交叠的占位全部判为碰撞", () => {
    expect(findRubyCollisions([band(0, 40), band(30, 70), band(60, 120)])).toEqual(
      new Set([0, 1, 2]),
    );
  });

  it("宽占位只与相邻的交叠者互判", () => {
    expect(findRubyCollisions([band(0, 40), band(30, 200), band(210, 260)])).toEqual(
      new Set([0, 1]),
    );
  });
});
