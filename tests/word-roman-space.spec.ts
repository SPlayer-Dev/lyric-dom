import { parseLyric } from "lyric-kit";
import { describe, expect, it } from "vitest";
import { LyricRenderer } from "../src";
import type { LyricLine } from "../src/types";

const renderLine = (line: LyricLine) => {
  const container = document.createElement("div");
  const renderer = new LyricRenderer(container, {
    showTranslation: true,
    showRomanization: true,
    showWordRomanization: true,
  });
  renderer.setLyrics([line]);
  return { container, renderer };
};

describe("word romanization with spaces", () => {
  it("将包含空格的单个 word 视为行级音译，不重复渲染整句 romanWord", () => {
    const line: LyricLine = {
      startTime: 0,
      endTime: 4000,
      words: [
        {
          startTime: 0,
          endTime: 4000,
          word: "우리가 만든 LOVE SCENARIO",
          romanWord: "u ri ga man deun LOVE SCENARIO",
        },
      ],
      translatedLyric: "我们一起创造的恋爱剧本",
      romanLyric: "u ri ga man deun LOVE SCENARIO",
      isBG: false,
      isDuet: false,
    };

    const { container, renderer } = renderLine(line);

    expect(container.querySelector(".lp-main")?.textContent).toBe("우리가 만든 LOVE SCENARIO");
    expect(container.querySelectorAll(".lp-word-roman").length).toBe(0);
    expect(container.querySelectorAll(".lp-roman-word").length).toBe(0);

    const subs = Array.from(container.querySelectorAll(".lp-sub")).map((el) => el.textContent);
    expect(subs).toEqual(["我们一起创造的恋爱剧本", "u ri ga man deun LOVE SCENARIO"]);

    renderer.dispose();
  });

  it("真正的逐词音译仍然逐词渲染", () => {
    const line: LyricLine = {
      startTime: 0,
      endTime: 4000,
      words: [
        { startTime: 0, endTime: 2000, word: "私", romanWord: "watashi" },
        { startTime: 2000, endTime: 4000, word: "は", romanWord: "wa" },
      ],
      translatedLyric: "我是",
      romanLyric: "watashi wa",
      isBG: false,
      isDuet: false,
    };

    const { container, renderer } = renderLine(line);

    expect(container.querySelectorAll(".lp-word-roman").length).toBe(2);
    expect(
      Array.from(container.querySelectorAll(".lp-roman-word")).map((el) => el.textContent),
    ).toEqual(["watashi", "wa"]);
    expect(Array.from(container.querySelectorAll(".lp-sub")).map((el) => el.textContent)).toEqual([
      "我是",
    ]);

    renderer.dispose();
  });

  it("单个词不含空格时仍按逐词音译渲染", () => {
    const line: LyricLine = {
      startTime: 0,
      endTime: 2000,
      words: [{ startTime: 0, endTime: 2000, word: "啊", romanWord: "a" }],
      translatedLyric: "",
      romanLyric: "a",
      isBG: false,
      isDuet: false,
    };

    const { container, renderer } = renderLine(line);

    expect(container.querySelectorAll(".lp-word-roman").length).toBe(1);
    expect(container.querySelector(".lp-roman-word")?.textContent).toBe("a");

    renderer.dispose();
  });

  it("真实 lyric-kit 产出的行级 romanWord 不再重复", () => {
    const parsed = parseLyric({
      content: "[02:43.539] 우리가 만든 LOVE SCENARIO",
      format: "lrc",
      translation: "[02:43.539] 我们一起创造的恋爱剧本",
      translationFormat: "lrc",
      romaji: "[02:43.539] u ri ga man deun LOVE SCENARIO",
      romajiFormat: "lrc",
    });
    const line = parsed.lines[0];

    const { container, renderer } = renderLine(line);

    expect(container.querySelector(".lp-main")?.textContent).toBe("우리가 만든 LOVE SCENARIO");
    expect(container.querySelectorAll(".lp-word-roman").length).toBe(0);
    expect(Array.from(container.querySelectorAll(".lp-sub")).map((el) => el.textContent)).toEqual([
      "我们一起创造的恋爱剧本",
      "u ri ga man deun LOVE SCENARIO",
    ]);

    renderer.dispose();
  });

  it("renders an annotated phrase once without a line-level fallback", () => {
    const { container, renderer } = renderLine({
      startTime: 0,
      endTime: 4000,
      words: [
        { startTime: 0, endTime: 2000, word: "hello world ", romanWord: "hello world" },
        { startTime: 2000, endTime: 4000, word: "again", romanWord: "again" },
      ],
      translatedLyric: "",
      romanLyric: "",
      isBG: false,
      isDuet: false,
    });

    expect(
      Array.from(container.querySelectorAll(".lp-roman-word"), (el) => el.textContent),
    ).toEqual(["hello world", "again"]);
    renderer.dispose();
  });
});
