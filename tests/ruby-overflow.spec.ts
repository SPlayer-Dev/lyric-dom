import { describe, expect, it } from "vitest";
import { buildWordSpans, measureAndApplyWordMasks } from "../src/engine/word-builder";
import type { LyricWord } from "../src/types";

const rubyWord = (text: string, annotation: string[], start: number, end: number): LyricWord => ({
  word: text,
  startTime: start,
  endTime: end,
  ruby: annotation.map((word) => ({ word, startTime: start, endTime: end })),
});

/**
 * 构造歌词单词
 * @param text - 基字文本
 * @param annotation - 注音片段，缺省表示无注音
 */
const word = (text: string, annotation?: string[]): LyricWord =>
  annotation ? rubyWord(text, annotation, 0, 100) : { word: text, startTime: 0, endTime: 100 };

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

/**
 * 构建一行歌词并取回每个单词 span 上的回收量变量
 * @param words - 按顺序排列的歌词单词
 */
const reclaimVarsOf = (words: LyricWord[]) => {
  const root = document.createElement("div");
  root.className = "lp-main";
  buildWordSpans(words, root, {
    enableEmphasizeEffect: false,
    emphasizeMinDuration: 1000,
    showRuby: true,
    showWordRoman: false,
  });
  return [...root.querySelectorAll<HTMLElement>(":scope > span")].map((span) =>
    span.style.getPropertyValue("--lp-ruby-overflow"),
  );
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

  it("掩码测量不再改动假名显示", () => {
    const { root, built } = build();
    measureAndApplyWordMasks([built.measurements], 0.2);
    for (const rt of root.querySelectorAll<HTMLElement>("rt")) expect(rt.style.display).toBe("");
  });
});

describe("注音悬挂回收量", () => {
  it("两侧均为假名时回收注音撑开的宽度", () => {
    expect(reclaimVarsOf([word("を"), word("司", ["つかさど"]), word("る")])).toEqual([
      "",
      "1.00em",
      "",
    ]);
  });

  it("相邻为汉字时不回收", () => {
    expect(reclaimVarsOf([word("物", ["ものがたり"]), word("語", ["がたり"])])).toEqual(["", ""]);
  });

  it("位于行首或行尾时不回收", () => {
    expect(reclaimVarsOf([word("司", ["つかさど"]), word("る"), word("を")])).toEqual(["", "", ""]);
    expect(reclaimVarsOf([word("を"), word("る"), word("司", ["つかさど"])])).toEqual(["", "", ""]);
  });

  it("间距不足时向外借用相邻假名", () => {
    expect(reclaimVarsOf([word("を"), word("司", ["たかまがはら"]), word("神")])).toEqual([
      "",
      "",
      "",
    ]);
    expect(
      reclaimVarsOf([word("を"), word("を"), word("司", ["たかまがはら"]), word("る"), word("る")]),
    ).toEqual(["", "", "2.00em", "", ""]);
  });

  it("相邻注音自身也会撑开时不回收", () => {
    expect(reclaimVarsOf([word("を"), word("司", ["つかさど"]), word("わ", ["はなれ"])])).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("基字非全角时不回收", () => {
    expect(reclaimVarsOf([word("を"), word("a", ["あいう"]), word("る")])).toEqual(["", "", ""]);
  });

  it("注音含非假名字符时不回收", () => {
    expect(reclaimVarsOf([word("を"), word("司", ["漢字"]), word("る")])).toEqual(["", "", ""]);
  });

  it("注音未超出基字时无需回收", () => {
    expect(reclaimVarsOf([word("を"), word("夜", ["よ"]), word("る")])).toEqual(["", "", ""]);
  });
});
