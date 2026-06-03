/**
 * Canvas 2D 人体剪影/能量体渲染器
 *
 * 从 MediaPipe Pose 33 点关键点绘制人体线框骨架 + 半透明填充轮廓，
 * 形成"经络能量体"的相术视觉，叠加在摄像头画面上方。
 *
 * 纯 Canvas 2D，无需 GPU
 */

// ──────────────────────────────────────────────
// 类型
// ──────────────────────────────────────────────

/** 归一化关键点 (0-1) */
export interface PoseKeypoint {
  x: number
  y: number
  z: number
  visibility: number
}

interface PixelPoint {
  x: number
  y: number
}

/** 骨骼连线 (两个 landmark 索引) */
type Connection = [number, number]

// ──────────────────────────────────────────────
// MediaPipe Pose 33 点连接关系
// ──────────────────────────────────────────────

/** 身体主要骨骼连线 (33 landmarks) */
const POSE_CONNECTIONS: Connection[] = [
  // 面部轮廓
  [0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [3, 7], [6, 8],
  // 躯干
  [9, 10], // 唇
  [11, 12], // 肩
  [11, 23], [12, 24], [23, 24], // 躯干
  // 左臂
  [11, 13], [13, 15],
  // 右臂
  [12, 14], [14, 16],
  // 左手
  [15, 17], [15, 19], [15, 21], [17, 19],
  // 右手
  [16, 18], [16, 20], [16, 22], [18, 20],
  // 左腿
  [23, 25], [25, 27],
  // 右腿
  [24, 26], [26, 28],
  // 左脚
  [27, 29], [27, 31], [29, 31],
  // 右脚
  [28, 30], [28, 32], [30, 32],
]

/** 身体轮廓连线 (用于填充区域) */
const BODY_OUTLINE: Connection[] = [
  // 头
  [0, 4], [4, 5], [5, 6], [6, 8], [8, 7], [7, 3], [3, 2], [2, 1], [1, 0],
  // 左半身
  [11, 13], [13, 15], [15, 17], [17, 19],
  [11, 23], [23, 25], [25, 27], [27, 31],
  // 右半身
  [12, 14], [14, 16], [16, 18], [18, 20],
  [12, 24], [24, 26], [26, 28], [28, 32],
  // 胯
  [23, 24],
]

/** 上半身/躯干轮廓 — 用于 torso 填充区域 */
const TORSO_HULL_INDICES = [
  0, 1, 2, 3, 7, 8, 6, 5, 4,   // 头
  11, 13, 15,                    // 左肩 + 左肘
  23, 25,                        // 左胯 + 左膝
  24, 26,                        // 右胯 + 右膝
  12, 14, 16,                    // 右肩 + 右肘
]

/** 脊柱连线 */
const SPINE_CONNECTIONS: Connection[] = [
  [0, 11], [0, 12],    // 头到双肩
  [11, 23], [12, 24],  // 肩到胯
  [0, 23], [0, 24],    // 头到胯 (斜线)
]

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

/** 计算点集的凸包 (Graham Scan) */
function convexHull(points: PixelPoint[]): PixelPoint[] {
  if (points.length <= 2) return points

  // 去重
  const unique = new Map<string, PixelPoint>()
  for (const p of points) {
    const key = `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    if (!unique.has(key)) unique.set(key, p)
  }
  const pts = [...unique.values()]
  if (pts.length <= 2) return pts

  // 按 y 排序
  pts.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)

  const cross = (o: PixelPoint, a: PixelPoint, b: PixelPoint): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: PixelPoint[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper: PixelPoint[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** 根据 visibility 平滑插值点 */
function lerpPoints(
  a: PixelPoint,
  b: PixelPoint,
  va: number,
  vb: number,
  threshold: number,
): PixelPoint[] {
  if (va >= threshold && vb >= threshold) return [a, b]
  if (va < threshold && vb < threshold) return []
  // 一端不可见 — 在可见端截断
  if (va >= threshold) return [{ x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3, }]
  return [{ x: b.x + (a.x - b.x) * 0.3, y: b.y + (a.y - b.y) * 0.3 }]
}

// ──────────────────────────────────────────────
// 渲染参数
// ──────────────────────────────────────────────

export interface BodySilhouetteOptions {
  /** 最低可见度阈值 */
  minVisibility: number
  /** 辉光强度 */
  glowIntensity: number
  /** 填充透明度 */
  fillAlpha: number
  /** 是否显示脊柱线 */
  showSpine: boolean
}

const DEFAULT_OPTIONS: BodySilhouetteOptions = {
  minVisibility: 0.4,
  glowIntensity: 2.0,
  fillAlpha: 0.28,
  showSpine: true,
}

// ──────────────────────────────────────────────
// 主渲染函数
// ──────────────────────────────────────────────

/**
 * 渲染人体能量体剪影
 *
 * @param ctx          目标 Canvas 2D 上下文
 * @param keypoints    MediaPipe Pose 33 个关键点
 * @param destWidth    目标画布宽度
 * @param destHeight   目标画布高度
 * @param time         单调时间 (秒)
 * @param spineEnergy  脊柱能量状态 (可选)
 * @param options      配置
 */
export function renderBodySilhouette(
  ctx: CanvasRenderingContext2D,
  keypoints: PoseKeypoint[] | null,
  destWidth: number,
  destHeight: number,
  time: number,
  _spineEnergy: unknown,
  options: BodySilhouetteOptions = {},
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (!keypoints || keypoints.length < 33) return

  const toPx = (kp: PoseKeypoint): PixelPoint => ({
    x: kp.x * destWidth,
    y: kp.y * destHeight,
  })

  const vis = (kp: PoseKeypoint): number => kp.visibility ?? 0.5

  const pulse = 0.85 + Math.sin(time * 1.8) * 0.15

  // ── Layer 1: 能量场 (宽辉光线框，覆盖全身) ──
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 12
  ctx.strokeStyle = '#ffd700'
  ctx.globalAlpha = 0.12 * pulse * opts.glowIntensity
  ctx.shadowColor = '#ffaa44'
  ctx.shadowBlur = 24

  for (const [a, b] of POSE_CONNECTIONS) {
    const kpA = keypoints[a]
    const kpB = keypoints[b]
    if (!kpA || !kpB) continue
    if (vis(kpA) < opts.minVisibility && vis(kpB) < opts.minVisibility) continue

    const pa = toPx(kpA)
    const pb = toPx(kpB)

    const segments = lerpPoints(pa, pb, vis(kpA), vis(kpB), opts.minVisibility)
    if (segments.length < 1) continue

    ctx.beginPath()
    ctx.moveTo(segments[0].x, segments[0].y)
    if (segments.length > 1) {
      ctx.lineTo(segments[1].x, segments[1].y)
    } else {
      // 单端可见 → 画短线段
      ctx.lineTo(segments[0].x + (pb.x - pa.x) * 0.1, segments[0].y + (pb.y - pa.y) * 0.1)
    }
    ctx.stroke()
  }

  ctx.restore()

  // ── Layer 2: 主骨架 (中宽度，金色) ──
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ffcc44'
  ctx.globalAlpha = 0.65 * pulse * opts.glowIntensity
  ctx.shadowColor = '#ff8800'
  ctx.shadowBlur = 10

  for (const [a, b] of POSE_CONNECTIONS) {
    const kpA = keypoints[a]
    const kpB = keypoints[b]
    if (!kpA || !kpB) continue
    if (vis(kpA) < opts.minVisibility && vis(kpB) < opts.minVisibility) continue

    const pa = toPx(kpA)
    const pb = toPx(kpB)
    const segments = lerpPoints(pa, pb, vis(kpA), vis(kpB), opts.minVisibility)
    if (segments.length < 2) continue

    ctx.beginPath()
    ctx.moveTo(segments[0].x, segments[0].y)
    ctx.lineTo(segments[1].x, segments[1].y)
    ctx.stroke()
  }

  ctx.restore()

  // ── Layer 3: 精线骨骼 (细白线) ──
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 1
  ctx.strokeStyle = '#fffde0'
  ctx.globalAlpha = 0.75 * pulse * opts.glowIntensity
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  for (const [a, b] of POSE_CONNECTIONS) {
    const kpA = keypoints[a]
    const kpB = keypoints[b]
    if (!kpA || !kpB) continue
    if (vis(kpA) < opts.minVisibility && vis(kpB) < opts.minVisibility) continue

    const pa = toPx(kpA)
    const pb = toPx(kpB)
    const segments = lerpPoints(pa, pb, vis(kpA), vis(kpB), opts.minVisibility)
    if (segments.length < 2) continue

    ctx.beginPath()
    ctx.moveTo(segments[0].x, segments[0].y)
    ctx.lineTo(segments[1].x, segments[1].y)
    ctx.stroke()
  }

  ctx.restore()

  // ── Layer 4: 躯干凸包填充 (半透明能量体) ──
  ctx.save()
  const hullPoints: PixelPoint[] = []
  for (const idx of TORSO_HULL_INDICES) {
    const kp = keypoints[idx]
    if (!kp) continue
    if (vis(kp) < opts.minVisibility) continue
    hullPoints.push(toPx(kp))
  }

  if (hullPoints.length >= 4) {
    const hull = convexHull(hullPoints)

    if (hull.length >= 3) {
      // 外光晕
      ctx.shadowColor = '#ff8800'
      ctx.shadowBlur = 20

      // 身体填充渐变
      const hullCenterX = hull.reduce((s, p) => s + p.x, 0) / hull.length
      const hullCenterY = hull.reduce((s, p) => s + p.y, 0) / hull.length
      const maxR = Math.max(...hull.map(p => {
        const dx = p.x - hullCenterX
        const dy = p.y - hullCenterY
        return Math.sqrt(dx * dx + dy * dy)
      }))

      const fillGrad = ctx.createRadialGradient(
        hullCenterX, hullCenterY, maxR * 0.15,
        hullCenterX, hullCenterY, maxR,
      )
      fillGrad.addColorStop(0, `rgba(255,200,100,${opts.fillAlpha * 1.5})`)
      fillGrad.addColorStop(0.5, `rgba(255,170,60,${opts.fillAlpha})`)
      fillGrad.addColorStop(1, `rgba(255,140,30,${opts.fillAlpha * 0.3})`)

      ctx.beginPath()
      ctx.moveTo(hull[0].x, hull[0].y)
      for (let i = 1; i < hull.length; i++) {
        ctx.lineTo(hull[i].x, hull[i].y)
      }
      ctx.closePath()
      ctx.fillStyle = fillGrad
      ctx.fill()

      // 轮廓线
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(255,180,80,0.25)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  ctx.restore()

  // ── Layer 5: 脊柱线 (从鼻根到会阴) ──
  if (opts.showSpine) {
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const [a, b] of SPINE_CONNECTIONS) {
      const kpA = keypoints[a]
      const kpB = keypoints[b]
      if (!kpA || !kpB) continue
      if (vis(kpA) < opts.minVisibility && vis(kpB) < opts.minVisibility) continue

      const pa = toPx(kpA)
      const pb = toPx(kpB)

      // 脊柱线辉光
      ctx.lineWidth = 3
      ctx.strokeStyle = '#ffaa00'
      ctx.globalAlpha = 0.65 * pulse
      ctx.shadowColor = '#ffaa00'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()

      // 脊柱线细线
      ctx.lineWidth = 1
      ctx.strokeStyle = '#ffd700'
      ctx.globalAlpha = 0.85 * pulse
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    }

    ctx.restore()
  }

  // ── Layer 6: 关节光点 ──
  ctx.save()
  const jointRadius = 5 + Math.sin(time * 3) * 1.2

  const jointIndices = [
    0,                     // 鼻
    7, 8,                  // 耳
    11, 12,                // 肩
    13, 14,                // 肘
    15, 16,                // 腕
    23, 24,                // 胯
    25, 26,                // 膝
    27, 28,                // 踝
  ]

  for (const idx of jointIndices) {
    const kp = keypoints[idx]
    if (!kp || vis(kp) < opts.minVisibility) continue
    const p = toPx(kp)

    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, jointRadius)
    g.addColorStop(0, 'rgba(255,215,0,0.8)')
    g.addColorStop(0.4, 'rgba(255,180,50,0.4)')
    g.addColorStop(1, 'rgba(255,150,30,0)')

    ctx.beginPath()
    ctx.arc(p.x, p.y, jointRadius, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()

    // 中心亮点
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
  }

  ctx.restore()
}
