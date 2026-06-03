/**
 * 风格化颅骨几何生成器
 *
 * 基于 MediaPipe Face Landmarker 478 点，选定子集映射出颅骨轮廓。
 * 仅需面部 landmark 坐标，无需 3D 模型或视频帧。
 */

// MediaPipe Face Landmarker 478 点的关键索引
const FACE_GROUP = {
  // 眼眶 — 左右各 16 点（原始数据有上/下眼睑细分，这里取外轮廓）
  LEFT_EYE_OUTLINE:  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  RIGHT_EYE_OUTLINE: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],

  // 鼻骨区域（上鼻梁 → 鼻尖 → 鼻翼）
  NOSE_BRIDGE: [6, 197, 195, 5, 4, 1, 2],

  // 颧弓 — 从眼眶外侧延伸到耳前
  LEFT_ZYGOMATIC:  [33, 133, 173, 50, 101, 36, 234, 93],
  RIGHT_ZYGOMATIC: [362, 398, 466, 280, 330, 266, 454, 323],

  // 上颌
  MAXILLA: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],

  // 下颌 — 沿下巴轮廓
  MANDIBLE: [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
} as const

export interface SkullWireframe {
  leftEyeSocket: Array<{ x: number; y: number }>
  rightEyeSocket: Array<{ x: number; y: number }>
  noseBridge: Array<{ x: number; y: number }>
  leftZygomatic: Array<{ x: number; y: number }>
  rightZygomatic: Array<{ x: number; y: number }>
  maxilla: Array<{ x: number; y: number }>
  mandible: Array<{ x: number; y: number }>
}

/**
 * 将 MediaPipe 478 点映射为风格化颅骨轮廓。
 *
 * @param faceLandmarks 归一化 (0~1) 的 478 个面部点
 * @returns 颅骨子轮廓集合；若 landmarks 不足 468 点则返回 null
 */
export function computeSkullWireframe(
  faceLandmarks: Array<{ x: number; y: number; z: number; visibility?: number }> | null,
): SkullWireframe | null {
  if (!faceLandmarks || faceLandmarks.length < 468) return null

  const get = (idx: number) => {
    const lm = faceLandmarks[idx]
    return { x: lm.x, y: lm.y }
  }

  return {
    leftEyeSocket: FACE_GROUP.LEFT_EYE_OUTLINE.map(get),
    rightEyeSocket: FACE_GROUP.RIGHT_EYE_OUTLINE.map(get),
    noseBridge: FACE_GROUP.NOSE_BRIDGE.map(get),
    leftZygomatic: FACE_GROUP.LEFT_ZYGOMATIC.map(get),
    rightZygomatic: FACE_GROUP.RIGHT_ZYGOMATIC.map(get),
    maxilla: FACE_GROUP.MAXILLA.map(get),
    mandible: FACE_GROUP.MANDIBLE.map(get),
  }
}

/**
 * 将归一化坐标缩放至目标画布尺寸。
 */
export function scaleSkullToCanvas(
  skull: SkullWireframe,
  destWidth: number,
  destHeight: number,
): SkullWireframe {
  const scale = (p: { x: number; y: number }) => ({
    x: p.x * destWidth,
    y: p.y * destHeight,
  })
  return {
    leftEyeSocket: skull.leftEyeSocket.map(scale),
    rightEyeSocket: skull.rightEyeSocket.map(scale),
    noseBridge: skull.noseBridge.map(scale),
    leftZygomatic: skull.leftZygomatic.map(scale),
    rightZygomatic: skull.rightZygomatic.map(scale),
    maxilla: skull.maxilla.map(scale),
    mandible: skull.mandible.map(scale),
  }
}

/**
 * 绘制闭合多边形路径。
 */
export function drawPolygonPath(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
): void {
  if (points.length < 2) return
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.closePath()
}
