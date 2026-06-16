export const STORY_SCENES = {
  horizonMessage: {
    fadeInStart: 7.05,
    holdStart: 7.15,
    holdEnd: 7.3,
    fadeOutEnd: 7.4,
  },
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function getScenePresence(progress, scene) {
  if (progress <= scene.fadeInStart || progress >= scene.fadeOutEnd) {
    return {
      opacity: 0,
      offsetX: progress < scene.fadeInStart ? -48 : 48,
      offsetY: progress < scene.fadeInStart ? 48 : -48,
    };
  }

  if (progress < scene.holdStart) {
    const t = smoothstep((progress - scene.fadeInStart) / (scene.holdStart - scene.fadeInStart));
    return { opacity: t, offsetX: -48 * (1 - t), offsetY: 48 * (1 - t) };
  }

  if (progress <= scene.holdEnd) {
    return { opacity: 1, offsetX: 0, offsetY: 0 };
  }

  const t = smoothstep((progress - scene.holdEnd) / (scene.fadeOutEnd - scene.holdEnd));
  return { opacity: 1 - t, offsetX: 48 * t, offsetY: -48 * t };
}
