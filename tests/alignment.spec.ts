import { describe, expect, it } from "vitest";
import { LyricRenderer } from "../src";

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
});
