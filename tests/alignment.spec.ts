import { describe, expect, it } from "vitest";
import { type LyricLine, LyricRenderer } from "../src";

const createContainer = () => {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 800 });
  Object.defineProperty(container, "clientHeight", { value: 600 });
  return container;
};

const ALIGNMENT_CLASSES = ["lp-align-left", "lp-align-center", "lp-align-right"];

const expectOnly = (container: HTMLElement, present: string | null) => {
  for (const cls of ALIGNMENT_CLASSES) {
    expect(container.classList.contains(cls)).toBe(cls === present);
  }
};

describe("歌词水平对齐", () => {
  it("默认 auto 不挂载对齐类", () => {
    const container = createContainer();
    const renderer = new LyricRenderer(container);
    expectOnly(container, null);
    renderer.dispose();
  });

  it("构造配置与 setConfig 同步对齐类且互斥", () => {
    const container = createContainer();
    const renderer = new LyricRenderer(container, { alignment: "center" });
    expectOnly(container, "lp-align-center");

    renderer.setConfig({ alignment: "right" });
    expectOnly(container, "lp-align-right");

    renderer.setConfig({ alignment: "left" });
    expectOnly(container, "lp-align-left");

    renderer.setConfig({ alignment: "auto" });
    expectOnly(container, null);

    renderer.dispose();
    expectOnly(container, null);
  });

  it("间奏期间动态切换对齐即时更新圆点且保留歌词和弹簧", () => {
    const container = createContainer();
    const renderer = new LyricRenderer(container, { enableScrollPreroll: false });
    const lines: LyricLine[] = [1000, 10000].map((startTime, index) => ({
      startTime,
      endTime: startTime + 2000,
      words: [{ word: `歌词${index}`, startTime, endTime: startTime + 2000 }],
      translatedLyric: "",
      romanLyric: "",
      isBG: false,
      isDuet: index === 1,
    }));
    renderer.setCurrentTime(5000);
    renderer.setLyrics(lines);
    const engine = renderer as unknown as {
      interludeState: { isActive: boolean; align: string; x: number };
      dotsContainerWidth: number;
      positionSprings: unknown[];
      processTime: (time: number) => boolean;
    };
    engine.processTime(5000);
    const firstLine = container.querySelector(".lp-line");
    const firstSpring = engine.positionSprings[0];
    const right = 800 - engine.dotsContainerWidth;
    expect(engine.interludeState).toMatchObject({ isActive: true, align: "right", x: right });
    try {
      for (const [alignment, x] of [
        ["left", 0],
        ["center", right / 2],
        ["right", right],
        ["auto", right],
      ] as const) {
        renderer.setConfig({ alignment });
        expect(engine.interludeState).toMatchObject({
          align: alignment === "auto" ? "right" : alignment,
          x,
        });
        expect(container.querySelector(".lp-line")).toBe(firstLine);
        expect(engine.positionSprings[0]).toBe(firstSpring);
      }
    } finally {
      renderer.dispose();
    }
  });
});
