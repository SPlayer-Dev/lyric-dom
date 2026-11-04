import { describe, expect, it } from "vitest";
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
