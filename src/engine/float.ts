/** 逐字上浮动画 */

/**
 * 为单个单词 span 创建基础上浮动画
 * @param wordEl - 单词 span 元素
 * @param delay - 相对行起始的延迟（ms）
 * @param duration - 动画持续时间（ms）
 * @param isBG - 是否为背景行
 * @returns 动画实例
 */
export const createFloatAnimation = (
  wordEl: HTMLElement,
  delay: number,
  duration: number,
  isBG: boolean,
): Animation => {
  let up = 0.05;
  if (isBG) up *= 2;
  const dur = Math.max(1000, duration);
  const del = Math.max(0, delay);

  const anim = wordEl.animate(
    [{ transform: "translateY(0px)" }, { transform: `translateY(${-up}em)` }],
    {
      duration: Number.isFinite(dur) ? dur : 0,
      delay: Number.isFinite(del) ? del : 0,
      id: "float-word",
      composite: "add",
      fill: "both",
      easing: "ease-out",
    },
  );
  anim.pause();
  return anim;
};
