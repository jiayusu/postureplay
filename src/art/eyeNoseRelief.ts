/**
 * Canvas 2D 眼鼻特效渲染器 — Eye Roller 风格
 *
 * 灵感来源：Eye Roller (yufengzhao.com)
 * 核心技法：
 *   - 从 MediaPipe Face Landmarker 提取眼轮廓多边形
 *   - 眼窝内填充白/金色半透明光泽
 *   - 瞳孔受"重力"（头部倾斜）驱动，在眼窝多边形内滚动
 *   - 鼻梁高光线勾勒
 *
 * 纯 Canvas 2D 实现，无需 GPU/WebGL，无需物理引擎。
 *
 * 关键技术差异 (vs Eye Roller):
 *   - Eye Roller 使用 Planck.js (Box2D) 做瞳孔物理仿真
 *   - 本实现使用简化的头部倾斜→重力位移映射，避免引入物理引擎依赖
 */

// ──────────────────────────────────────────────
// 类型
// ──────────────────────────────────────────────

/** 归一化面部关键点 (0-1) */
export interface FaceLandmarkPoint {
  x: number
  y: number
  z: number
  visibility: number
}

/** 画布像素坐标点 */
interface PixelPoint {
  x: number
  y: number
}

/** 瞳孔内部状态 */
interface PupilState {
  /** 当前归一化位置 [0-1] */
  x: number
  y: number
  /** 速度向量 */
  vx: number
  vy: number
  /** 上一帧时间戳 */
  lastTime: number
}

// ──────────────────────────────────────────────
// MediaPipe 面部关键点索引
// ──────────────────────────────────────────────

/** 左眼轮廓 16 点 (MediaPipe 478 点索引) */
export const LEFT_EYE_CONTOUR = [
  33, 7, 163, 144, 145, 153, 154, 155, 133,
  173, 157, 158, 159, 160, 161, 246,
]

/** 右眼轮廓 16 点 */
export const RIGHT_EYE_CONTOUR = [
  263, 249, 390, 373, 374, 380, 381, 382, 362,
  398, 384, 385, 386, 387, 388, 466,
]

/** 左眼虹膜中心 */
export const LEFT_IRIS_CENTER = 468
/** 右眼虹膜中心 */
export const RIGHT_IRIS_CENTER = 473

/** 鼻梁线 (从上到下) */
export const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4, 1]

/** 鼻子两侧翼 */
export const NOSE_ALAE = [64, 294]

// ──────────────────────────────────────────────
// 几何工具
// ──────────────────────────────────────────────

/** 计算多边形包围盒中心 */
function polygonCenter(points: PixelPoint[]): PixelPoint {
  let cx = 0, cy = 0
  for (const p of points) { cx += p.x; cy += p.y }
  return { x: cx / points.length, y: cy / points.length }
}

/** 点是否在多边形内 (射线法) */
function pointInPolygon(px: number, py: number, polygon: PixelPoint[]): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** 将点约束在多边形内部 (推移到最近的边) */
function clampInPolygon(p: PixelPoint, polygon: PixelPoint[], margin: number): PixelPoint {
  if (pointInPolygon(p.x, p.y, polygon)) {
    // 在内部 → 检查是否太靠近边缘
    return p
  }
  // 在外部 → 找到最近的边投影点
  let bestDist = Infinity
  let bestX = p.x, bestY = p.y
  const n = polygon.length

  for (let i = 0; i < n; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % n]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const lenSq = abx * abx + aby * aby
    if (lenSq === 0) continue

    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq
    t = Math.max(0, Math.min(1, t))

    const projX = a.x + t * abx
    const projY = a.y + t * aby
    const dx = p.x - projX
    const dy = p.y - projY
    const dist = dx * dx + dy * dy

    if (dist < bestDist) {
      bestDist = dist
      // 把投影点稍微向多边形内部推移
      const nx = -aby / Math.sqrt(lenSq)
      const ny = abx / Math.sqrt(lenSq)
      bestX = projX + nx * margin
      bestY = projY + ny * margin
    }
  }

  return { x: bestX, y: bestY }
}

/** 两点距离 */
function dist(a: PixelPoint, b: PixelPoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

// ──────────────────────────────────────────────
// 瞳孔物理 (简化)
// ──────────────────────────────────────────────

/** 瞳孔物理参数 */
interface PupilPhysicsConfig {
  /** 重力加速度 (像素/秒²) */
  gravity: number
  /** 弹簧刚度 (拉回眼窝中心) */
  springStiffness: number
  /** 阻尼系数 */
  damping: number
  /** 瞳孔半径比例 (相对眼窝大小) */
  radiusRatio: number
  /** 最小瞳孔半径 (像素) */
  minRadius: number
  /** 最大抖动位移 (像素) */
  jitter: number
}

const DEFAULT_PUPIL_PHYSICS: PupilPhysicsConfig = {
  gravity: 800,
  springStiffness: 300,
  damping: 0.85,
  radiusRatio: 0.12,
  minRadius: 6,
  jitter: 1.5,
}

// 瞳孔状态 (跨帧保持)
const pupilStates: PupilState[] = [
  { x: 0.5, y: 0.5, vx: 0, vy: 0, lastTime: 0 },
  { x: 0.5, y: 0.5, vx: 0, vy: 0, lastTime: 0 },
]

/**
 * 从眼睛位置差估算头部滚转角度 (弧度)
 * 正值 = 头部向右倾斜
 */
function estimateHeadRoll(leftEyeCenter: PixelPoint, rightEyeCenter: PixelPoint): number {
  const dx = rightEyeCenter.x - leftEyeCenter.x
  const dy = rightEyeCenter.y - leftEyeCenter.y
  return Math.atan2(dy, dx)
}

/**
 * 更新瞳孔位置 (Verlet-like integration)
 *
 * @param idx        瞳孔索引 (0=左眼, 1=右眼)
 * @param time       当前时间 (秒)
 * @param socket     眼窝多边形 (像素坐标)
 * @param center     眼窝中心 (像素坐标)
 * @param irisCenterMediaPipe  虹膜中心 (归一化0-1)，用于初始化
 * @param headRoll   头部滚转角度
 * @param config     物理参数
 * @param canvasW    画布宽度
 * @param canvasH    画布高度
 * @returns 瞳孔像素位置
 */
function updatePupil(
  idx: number,
  time: number,
  socket: PixelPoint[],
  center: PixelPoint,
  irisCenterMediaPipe: { x: number; y: number } | null,
  headRoll: number,
  config: PupilPhysicsConfig,
  canvasW: number,
  canvasH: number,
): PixelPoint {
  const state = pupilStates[idx]
  const dt = Math.min(time - state.lastTime, 0.1) // cap delta
  state.lastTime = time

  if (dt <= 0) {
    return { x: center.x, y: center.y }
  }

  // 初始化：瞳孔从虹膜中心位置开始
  if (state.x === 0.5 && state.y === 0.5 && irisCenterMediaPipe) {
    state.x = irisCenterMediaPipe.x
    state.y = irisCenterMediaPipe.y
  }

  // 转换为像素坐标
  let px = state.x * canvasW
  let py = state.y * canvasH

  // ── 重力加速度 (受头部倾斜影响) ──
  const gravX = Math.sin(headRoll) * config.gravity
  const gravY = Math.cos(headRoll) * config.gravity // 垂直为主

  // ── 弹簧力 (拉回眼窝中心) ──
  const springX = (center.x - px) * config.springStiffness
  const springY = (center.y - py) * config.springStiffness

  // ── 速度积分 ──
  state.vx += (gravX + springX) * dt
  state.vy += (gravY + springY) * dt
  state.vx *= config.damping
  state.vy *= config.damping

  // ── 位置积分 ──
  px += state.vx * dt
  py += state.vy * dt

  // ── 抖动 ──
  const jx = (Math.sin(time * 37 + idx) * config.jitter)
  const jy = (Math.cos(time * 43 + idx * 1.7) * config.jitter)
  px += jx
  py += jy

  // ── 约束在眼窝多边形内 ──
  const clamped = clampInPolygon({ x: px, y: py }, socket, config.minRadius + 2)
  px = clamped.x
  py = clamped.y

  // 存回归一化状态
  state.x = px / canvasW
  state.y = py / canvasH

  return { x: px, y: py }
}

// ──────────────────────────────────────────────
// 主渲染函数
// ──────────────────────────────────────────────

export interface EyeNoseOptions {
  /** 瞳孔物理参数 (可选) */
  pupilPhysics?: Partial<PupilPhysicsConfig>
  /** 调试模式：显示多边形线框 */
  debug?: boolean
}

/**
 * 渲染眼鼻特效到目标 Canvas
 *
 * @param ctx           目标 Canvas 2D 上下文
 * @param faceLandmarks MediaPipe 478 点面部关键点
 * @param destWidth     目标画布宽度
 * @param destHeight    目标画布高度
 * @param time          单调递增时间 (秒)
 * @param options       效果选项
 */
export function renderEyeNoseRelief(
  ctx: CanvasRenderingContext2D,
  faceLandmarks: FaceLandmarkPoint[] | null,
  destWidth: number,
  destHeight: number,
  time: number,
  options: EyeNoseOptions = {},
): void {
  const physics = { ...DEFAULT_PUPIL_PHYSICS, ...options.pupilPhysics }

  if (!faceLandmarks || faceLandmarks.length < 468) return

  // ── 提取面部关键点并转换为像素坐标 ──
  const toPx = (lm: FaceLandmarkPoint): PixelPoint => ({
    x: lm.x * destWidth,
    y: lm.y * destHeight,
  })

  // 眼窝多边形
  const leftSocket = LEFT_EYE_CONTOUR.map(i => toPx(faceLandmarks[i]))
  const rightSocket = RIGHT_EYE_CONTOUR.map(i => toPx(faceLandmarks[i]))
  const leftCenter = polygonCenter(leftSocket)
  const rightCenter = polygonCenter(rightSocket)

  // 虹膜中心 (归一化)
  const leftIris = faceLandmarks[LEFT_IRIS_CENTER]
  const rightIris = faceLandmarks[RIGHT_IRIS_CENTER]

  // 头部滚转角
  const headRoll = estimateHeadRoll(leftCenter, rightCenter)

  // 瞳孔物理更新
  const leftPupil = updatePupil(
    0, time, leftSocket, leftCenter,
    leftIris ? { x: leftIris.x, y: leftIris.y } : null,
    headRoll, physics, destWidth, destHeight,
  )
  const rightPupil = updatePupil(
    1, time, rightSocket, rightCenter,
    rightIris ? { x: rightIris.x, y: rightIris.y } : null,
    headRoll, physics, destWidth, destHeight,
  )

  // 鼻梁关键点
  const noseBridgePts = NOSE_BRIDGE.map(i => toPx(faceLandmarks[i]))
  const noseTip = noseBridgePts[noseBridgePts.length - 1]
  const noseAlaePts = NOSE_ALAE.map(i => toPx(faceLandmarks[i]))

  // ── 绘制眼窝基底 (白色填充) ──
  drawEyeSockets(ctx, leftSocket, rightSocket)

  // ── 绘制瞳孔 ──
  const pupilRadius = (dist(leftCenter, rightCenter) / 12) * physics.radiusRatio
  const clampedRadius = Math.max(physics.minRadius, pupilRadius)

  drawPupil(ctx, leftPupil, clampedRadius, time, 0)
  drawPupil(ctx, rightPupil, clampedRadius, time, 1)

  // ── 眼部轮廓描边 ──
  drawEyeOutlines(ctx, leftSocket, rightSocket, time)

  // ── 鼻梁高光 ──
  drawNoseBridge(ctx, noseBridgePts, noseTip, noseAlaePts, time, destHeight)

  // ── 眼窝中心高光 (星点) ──
  drawEyeHighlights(ctx, leftCenter, rightCenter, clampedRadius, time)
}

// ──────────────────────────────────────────────
// 绘制子函数
// ──────────────────────────────────────────────

/** 绘制眼窝白色基底 */
function drawEyeSockets(
  ctx: CanvasRenderingContext2D,
  leftSocket: PixelPoint[],
  rightSocket: PixelPoint[],
): void {
  ctx.save()

  // 外发光层
  for (const socket of [leftSocket, rightSocket]) {
    ctx.beginPath()
    ctx.moveTo(socket[0].x, socket[0].y)
    for (let i = 1; i < socket.length; i++) {
      ctx.lineTo(socket[i].x, socket[i].y)
    }
    ctx.closePath()

    // 外光晕
    ctx.shadowColor = 'rgba(255,215,0,0.5)'
    ctx.shadowBlur = 12
    ctx.fillStyle = 'rgba(255,248,235,0.15)'
    ctx.fill()

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }

  // 内填充
  for (const socket of [leftSocket, rightSocket]) {
    ctx.beginPath()
    ctx.moveTo(socket[0].x, socket[0].y)
    for (let i = 1; i < socket.length; i++) {
      ctx.lineTo(socket[i].x, socket[i].y)
    }
    ctx.closePath()

    // 从中心渐变 (中间白，边缘透明)
    const cx = socket.reduce((s, p) => s + p.x, 0) / socket.length
    const cy = socket.reduce((s, p) => s + p.y, 0) / socket.length
    const r = Math.max(
      ...socket.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)),
    )

    const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r)
    grad.addColorStop(0, 'rgba(255,245,230,0.55)')
    grad.addColorStop(0.5, 'rgba(255,240,220,0.3)')
    grad.addColorStop(1, 'rgba(255,230,200,0.05)')
    ctx.fillStyle = grad
    ctx.fill()
  }

  ctx.restore()
}

/** 绘制单个瞳孔 (深色圆 + 高光) */
function drawPupil(
  ctx: CanvasRenderingContext2D,
  pos: PixelPoint,
  radius: number,
  time: number,
  idx: number,
): void {
  ctx.save()

  // 瞳孔主体 (深色渐变)
  const grad = ctx.createRadialGradient(
    pos.x - radius * 0.15, pos.y - radius * 0.1, radius * 0.05,
    pos.x, pos.y, radius,
  )
  grad.addColorStop(0, '#0a0a14')
  grad.addColorStop(0.7, '#1a1a28')
  grad.addColorStop(1, '#2a2a38')

  ctx.beginPath()
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 4
  ctx.fill()

  // 瞳孔虹膜纹理环
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.arc(pos.x, pos.y, radius * 0.85, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(180,160,130,0.4)'
  ctx.lineWidth = 0.5
  ctx.stroke()

  // 高光点 (白色小圆)
  const hlAngle = -0.5 + Math.sin(time * 1.5 + idx) * 0.3
  const hlDist = radius * 0.5
  const hlX = pos.x + Math.cos(hlAngle) * hlDist
  const hlY = pos.y + Math.sin(hlAngle) * hlDist
  const hlRadius = radius * 0.22

  const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlRadius)
  hlGrad.addColorStop(0, 'rgba(255,255,255,0.9)')
  hlGrad.addColorStop(0.5, 'rgba(255,255,255,0.4)')
  hlGrad.addColorStop(1, 'rgba(255,255,255,0)')

  ctx.beginPath()
  ctx.arc(hlX, hlY, hlRadius, 0, Math.PI * 2)
  ctx.fillStyle = hlGrad
  ctx.fill()

  // 第二高光 (更小，偏侧)
  const hl2X = pos.x + Math.cos(hlAngle + 1.0) * hlDist * 0.7
  const hl2Y = pos.y + Math.sin(hlAngle + 1.0) * hlDist * 0.7
  const hl2R = radius * 0.1

  ctx.beginPath()
  ctx.arc(hl2X, hl2Y, hl2R, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fill()

  ctx.restore()
}

/** 绘制眼部轮廓描边 */
function drawEyeOutlines(
  ctx: CanvasRenderingContext2D,
  leftSocket: PixelPoint[],
  rightSocket: PixelPoint[],
  time: number,
): void {
  ctx.save()

  const pulse = 0.7 + Math.sin(time * 2.5) * 0.3

  // 三层描边 (辉光→粗线→细线)
  const passes: Array<{ alpha: number; width: number; blur: number }> = [
    { alpha: 0.25 * pulse, width: 1, blur: 8 },
    { alpha: 0.4 * pulse, width: 1.5, blur: 3 },
    { alpha: 0.7, width: 0.8, blur: 0 },
  ]

  for (const pass of passes) {
    ctx.globalAlpha = pass.alpha
    ctx.strokeStyle = '#ffd700'
    ctx.lineWidth = pass.width
    ctx.lineJoin = 'round'
    ctx.shadowColor = '#ffaa44'
    ctx.shadowBlur = pass.blur

    for (const socket of [leftSocket, rightSocket]) {
      ctx.beginPath()
      ctx.moveTo(socket[0].x, socket[0].y)
      for (let i = 1; i < socket.length; i++) {
        ctx.lineTo(socket[i].x, socket[i].y)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }

  ctx.restore()
}

/** 绘制鼻梁高光 */
function drawNoseBridge(
  ctx: CanvasRenderingContext2D,
  bridgePts: PixelPoint[],
  noseTip: PixelPoint,
  alaePts: PixelPoint[],
  time: number,
  _destHeight: number,
): void {
  ctx.save()

  const pulse = 0.5 + Math.sin(time * 1.3) * 0.2

  // ── 鼻梁主线 (从鼻根到鼻尖) ──
  ctx.strokeStyle = '#ffcc77'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = '#ffaa44'
  ctx.shadowBlur = 6
  ctx.globalAlpha = pulse * 0.6

  ctx.beginPath()
  ctx.moveTo(bridgePts[0].x, bridgePts[0].y)
  ctx.quadraticCurveTo(
    bridgePts[3].x, bridgePts[3].y,
    noseTip.x, noseTip.y,
  )
  ctx.stroke()

  // 细线高光
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 0.5
  ctx.shadowBlur = 3
  ctx.globalAlpha = pulse * 0.35

  ctx.beginPath()
  ctx.moveTo(bridgePts[0].x, bridgePts[0].y)
  ctx.quadraticCurveTo(
    bridgePts[3].x, bridgePts[3].y,
    noseTip.x, noseTip.y,
  )
  ctx.stroke()

  // ── 鼻尖高光圆点 ──
  const tipGlowRadius = 5
  const tipGrad = ctx.createRadialGradient(
    noseTip.x, noseTip.y, 0,
    noseTip.x, noseTip.y, tipGlowRadius,
  )
  tipGrad.addColorStop(0, 'rgba(255,220,160,0.7)')
  tipGrad.addColorStop(0.5, 'rgba(255,200,140,0.3)')
  tipGrad.addColorStop(1, 'rgba(255,200,140,0)')

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.arc(noseTip.x, noseTip.y, tipGlowRadius, 0, Math.PI * 2)
  ctx.fillStyle = tipGrad
  ctx.fill()

  // ── 鼻翼微光 ──
  for (const p of alaePts) {
    const ag = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 4)
    ag.addColorStop(0, 'rgba(255,200,150,0.25)')
    ag.addColorStop(1, 'rgba(255,200,150,0)')
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = ag
    ctx.fill()
  }

  ctx.restore()
}

/** 绘制眼窝中心星点高光 */
function drawEyeHighlights(
  ctx: CanvasRenderingContext2D,
  leftCenter: PixelPoint,
  rightCenter: PixelPoint,
  pupilRadius: number,
  time: number,
): void {
  ctx.save()

  const pulse = 0.4 + Math.sin(time * 3) * 0.25

  for (const center of [leftCenter, rightCenter]) {
    // 放射状光芒
    const starRadius = pupilRadius * 2.2
    const rays = 6

    ctx.beginPath()
    for (let i = 0; i < rays * 2; i++) {
      const angle = (i / (rays * 2)) * Math.PI * 2 - Math.PI / 2
      const r = i % 2 === 0 ? starRadius : starRadius * 0.4
      const sx = center.x + Math.cos(angle) * r
      const sy = center.y + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    }
    ctx.closePath()

    ctx.fillStyle = `rgba(255,215,0,${0.15 * pulse})`
    ctx.shadowColor = 'rgba(255,200,0,0.5)'
    ctx.shadowBlur = 6
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }

  ctx.restore()
}

/**
 * 重置瞳孔状态 (切换页面/重新进入时调用)
 */
export function resetPupilStates(): void {
  pupilStates[0] = { x: 0.5, y: 0.5, vx: 0, vy: 0, lastTime: 0 }
  pupilStates[1] = { x: 0.5, y: 0.5, vx: 0, vy: 0, lastTime: 0 }
}
