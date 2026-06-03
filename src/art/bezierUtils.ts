/**
 * 贝塞尔曲线工具 — 脊柱藤蔓路径平滑插值
 */

export interface Point2D {
  x: number
  y: number
}

/**
 * 三次贝塞尔曲线路径生成。
 * 将离散点集转为平滑曲线点集。
 *
 * @param points  输入控制点
 * @param tension 张力 (0~1)，越大越平滑，默认 0.3
 * @returns 细分后的平滑曲线点集
 */
export function cubicBezierSmooth(
  points: Point2D[],
  tension: number = 0.3,
): Point2D[] {
  if (points.length < 2) return points

  const result: Point2D[] = []
  const n = points.length

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(n - 1, i + 2)]

    // Catmull-Rom → Cubic Bezier 控制点
    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension

    // 将段细分为 12 个子点
    const steps = 12
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const t2 = t * t
      const t3 = t2 * t
      const u = 1 - t
      const u2 = u * u
      const u3 = u2 * u
      result.push({
        x: u3 * p1.x + 3 * u2 * t * cp1x + 3 * u * t2 * cp2x + t3 * p2.x,
        y: u3 * p1.y + 3 * u2 * t * cp1y + 3 * u * t2 * cp2y + t3 * p2.y,
      })
    }
  }

  return result
}

/**
 * 从 MediaPipe Pose landmarks 提取脊柱线（5 个关键点）。
 *
 * 索引：0=鼻, 11=左肩, 12=右肩, 23=左胯, 24=右胯
 * 计算中线：鼻→肩中点→胯中点
 *
 * @param keypoints Pose 关键点数组（归一化 0~1）
 * @param destWidth  目标画布宽度
 * @param destHeight 目标画布高度
 */
export function extractSpineLine(
  keypoints: Array<{ x: number; y: number; visibility: number }> | null,
  destWidth: number,
  destHeight: number,
): Point2D[] {
  if (!keypoints || keypoints.length < 25) {
    // Fallback: 垂直居中直线
    const cx = destWidth * 0.5
    return [
      { x: cx, y: destHeight * 0.05 },
      { x: cx, y: destHeight * 0.35 },
      { x: cx, y: destHeight * 0.55 },
      { x: cx, y: destHeight * 0.75 },
      { x: cx, y: destHeight * 0.95 },
    ]
  }

  const nose = keypoints[0]
  const lShoulder = keypoints[11]
  const rShoulder = keypoints[12]
  const lHip = keypoints[23]
  const rHip = keypoints[24]

  const shoulderMid = {
    x: (lShoulder.x + rShoulder.x) / 2 * destWidth,
    y: (lShoulder.y + rShoulder.y) / 2 * destHeight,
  }
  const hipMid = {
    x: (lHip.x + rHip.x) / 2 * destWidth,
    y: (lHip.y + rHip.y) / 2 * destHeight,
  }
  const nosePx = {
    x: nose.x * destWidth,
    y: nose.y * destHeight,
  }

  // 脊柱底部 —— 胯中点再往下延一段
  const tailbone = {
    x: hipMid.x,
    y: hipMid.y + (hipMid.y - shoulderMid.y) * 0.3,
  }

  // 5 个关键节点
  return [
    nosePx,
    {
      x: nosePx.x + (shoulderMid.x - nosePx.x) * 0.55,
      y: nosePx.y + (shoulderMid.y - nosePx.y) * 0.65,
    },
    shoulderMid,
    hipMid,
    tailbone,
  ]
}

/**
 * 生成液滴/波浪偏移效果——用于脊柱侧弯的水波纹。
 *
 * @param baseY    基础 Y 坐标
 * @param offset   偏移幅度
 * @param time     动画时间
 * @param freq     频率
 * @returns X 方向偏移量
 */
export function waterRippleOffset(
  baseY: number,
  offset: number,
  time: number,
  freq: number = 0.02,
): number {
  return Math.sin(baseY * freq + time * 1.5) * offset
}
