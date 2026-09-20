import { describe, expect, it, vi } from "vitest";
import { LyricRenderer } from "../src";
import {
  createEmphasizeAnimations,
  shouldChunkEmphasize,
  shouldEmphasize,
} from "../src/engine/emphasize";
import { buildWordSpans } from "../src/engine/word-builder";
import type { LyricWord } from "../src/types";

const word = (text: string, startTime: number, endTime: number): LyricWord => ({
  word: text,
  startTime,
  endTime,
});

describe("长音强调辉光", () => {
  it("仅选择达到时长门槛的合理词组", () => {
    expect(shouldEmphasize(word("爱", 0, 1200))).toBe(true);
    expect(shouldEmphasize(word("爱", 0, 999))).toBe(false);
    expect(shouldEmphasize(word("a", 0, 2000))).toBe(false);
    expect(shouldChunkEmphasize([word("he", 0, 600), word("llo", 600, 1600)])).toBe(true);
  });

  it("关闭时保持普通 DOM，开启时只拆分符合条件的字符", () => {
    const words = [word("长", 0, 1200), word("音", 1200, 1700)];
    const disabledRoot = document.createElement("div");
    const disabled = buildWordSpans(words, disabledRoot, {
      enableEmphasizeEffect: false,
      emphasizeMinDuration: 1000,
      showRuby: false,
    });
    expect(disabledRoot.querySelectorAll(".lp-emp-chars")).toHaveLength(0);
    expect(disabled.animTargets.every((target) => !target.isEmphasize)).toBe(true);

    const enabledRoot = document.createElement("div");
    const enabled = buildWordSpans(words, enabledRoot, {
      enableEmphasizeEffect: true,
      emphasizeMinDuration: 1000,
      showRuby: false,
    });
    expect(enabledRoot.textContent).toBe(disabledRoot.textContent);
    expect(enabledRoot.querySelectorAll(".lp-emp-wrapper > span")).toHaveLength(1);
    expect(enabledRoot.querySelector(".lp-emp-wrapper")).not.toBeNull();
    expect(enabled.animTargets[0].word.endTime).toBe(1200);
    expect(enabled.animTargets[0].isEmphasize).toBe(true);
    expect(enabled.animTargets[1].isEmphasize).toBe(false);
  });

  it("辉光关键帧包含可见的 text-shadow，而不只是缩放", () => {
    const capturedFrames: Keyframe[][] = [];
    const fakeAnimation = {
      pause() {},
    } as unknown as Animation;
    const fakeElement = {
      animate(frames: Keyframe[]) {
        capturedFrames.push(frames);
        return fakeAnimation;
      },
    } as unknown as HTMLElement;

    const animations = createEmphasizeAnimations([fakeElement], 2000, 0, false, false);
    expect(animations).toHaveLength(2);
    expect(capturedFrames[0].some((frame) => String(frame.textShadow).includes("rgba"))).toBe(true);
    expect(capturedFrames[0].some((frame) => !String(frame.textShadow).endsWith(", 0)"))).toBe(
      true,
    );
  });

  it("播放中热开关会按当前时间重建激活行动画", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const renderer = new LyricRenderer(container);
    renderer.setLyrics([
      {
        words: [word("长音", 1000, 4000)],
        translatedLyric: "",
        romanLyric: "",
        startTime: 1000,
        endTime: 4000,
        isBG: false,
        isDuet: false,
      },
    ]);

    const activate = vi.fn();
    const cancelAll = vi.fn();
    const engine = renderer as unknown as {
      processTime(time: number): void;
      lineAnimations: { activate: typeof activate; cancelAll: typeof cancelAll };
    };
    engine.processTime(2000);
    engine.lineAnimations.activate = activate;
    engine.lineAnimations.cancelAll = cancelAll;

    renderer.setConfig({ enableEmphasizeEffect: true });
    expect(cancelAll).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith(
      0,
      expect.any(Object),
      expect.any(Array),
      2000,
      expect.objectContaining({ emphasize: true }),
    );

    activate.mockClear();
    renderer.setConfig({ enableFloatAnimation: true });
    expect(activate).toHaveBeenCalledWith(
      0,
      expect.any(Object),
      expect.any(Array),
      2000,
      expect.objectContaining({ float: true, emphasize: true }),
    );
    renderer.dispose();
  });
});
