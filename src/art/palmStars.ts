/**
 * 手相「掌中星辰」隐喻渲染器
 *
 * 基于手掌关键点 + 分析指标直接绘制：
 *   - 九宫八卦网格 (3×3 宫位覆盖手掌)
 *   - 大鱼际（金星丘）绿色能量粒子
 *   - 手指关节蓝色荧光骨骼线
 *   - 骨节红色脉冲点
 */

import {
  spawnParticles,
  updateParticles,
  renderParticles,
  type Particle,
} from './particleEngine'
import type { PalmStarsMetrics } from '../types/physiognomy'

// ─── 视觉常量 ───

const BAGUA_NAMES = [
  '乾·肺', '坎·肾', '艮·胃',
  '震·肝', '中·丹田', '巽·胆',
  '离·心', '坤·脾', '兑·肠',
] as const

const BAGUA_COLORS_HEALTHY = [
  '#ddd',   // 乾 金
  '#6688dd', // 坎 水
  '#ddaa66', // 艮 土
  '#66dd66', // 震 木
  '#fffde0', // 中 丹田
  '#66ddaa', // 巽 木
  '#dd6666', // 离 火
  '#ddaa66', // 坤 土
  '#ddcc88', // 兑 金
]

const BAGUA_COLORS_DEPLETED = [
  '#666', '#334', '#554', '#335', '#444', '#355', '#533', '#554', '#665',
]

// 手工定义的 21 个关键点之间的骨骼连接
const HAND_BONES: Array<[number, number]> = [
  // 手腕 → 掌根
  [0, 1], [0, 5], [0, 17],
  // 拇指
  [1, 2], [2, 3], [3, 4],
  // 食指
  [5, 6], [6, 7], [7, 8],
  // 中指
  [9, 10], [10, 11], [11, 12],
  // 无名指
  [13, 14], [14, 15], [15, 16],
  // 小指
  [17, 18], [18, 19], [19, 20],
  // 掌心连线
  [5, 9], [9, 13], [13, 17],
]

// 关节索引（每根手指的指节弯折点：MCP, PIP, DIP）
const JOINT_INDICES = [
  // 拇指
  { mcp: 2, pip: 3, dip: 4 },
  // 食指
  { mcp: 5, pip: 6, dip: 7 },
  // 中指
  { mcp: 9, pip: 10, dip: 11 },
  // 无名指
  { mcp: 13, pip: 14, dip: 15 },
  // 小指
  { mcp: 17, pip: 18, dip: 19 },
]

// 粒子池
let palmParticles: Particle[] = []
let lastParticleSpawn = 0
const PALM_PARTICLE_MAX = 200

// ─── 公共 API ───

/**
 * @param ctx            目标 Canvas 2D
 * @param destWidth      画布宽度
 * @param destHeight     画布高度
 * @param palmStars      掌中星辰指标（9 宫 energyScore + 金星丘 fullness + 线条）
 * @param handLandmarks  MediaPipe Hand 21 点归一化 [0~1]
 * @param time           动画时间 (秒)
 */
export function renderPalmStars(
  ctx: CanvasRenderingContext2D,
  destWidth: number,
  destHeight: number,
  palmStars: PalmStarsMetrics | null,
  handLandmarks: Array<{ x: number; y: number; z?: number }> | null,
  time: number,
): void {
  ctx.clearRect(0, 0, destWidth, destHeight)

  const hasHand = handLandmarks && handLandmarks.length >= 21
  const venus = palmStars?.venusMountFullness ?? 0.3
  const vitality = palmStars?.vitalityScore ?? 60
  const regions = palmStars?.regions ?? []

  // 手掌区域定义（基于 wrist=0, middle_mcp=9）
  if (hasHand) {
    const landmarks = handLandmarks!
    const wrist = { x: landmarks[0].x * destWidth, y: landmarks[0].y * destHeight }
    const middleMcp = { x: landmarks[9].x * destWidth, y: landmarks[9].y * destHeight }

    const handH = Math.abs(middleMcp.y - wrist.y) * 1.6
    const handW = Math.max(destWidth * 0.4, destWidth * 0.55)
    const handTop = Math.min(wrist.y, middleMcp.y) - handH * 0.15
    const handLeft = middleMcp.x - handW / 2

    // ── 1. 九宫八卦网格 ──
    drawBaguaGrid(ctx, handLeft, handTop, handW, handH, regions, time)

    // ── 2. 大鱼际能量粒子 ──
    drawThenarParticles(ctx, handLeft, handTop, handW, handH, venus, vitality, time)

    // ── 3. 蓝色荧光骨骼线 ──
    drawBoneGlow(ctx, landmarks, destWidth, destHeight, vitality, time)

    // ── 4. 关节红点 ──
    drawJointPulses(ctx, landmarks, destWidth, destHeight, time)
  } else {
    // 无手部检测 → 占位提示
    drawNoHandHint(ctx, destWidth, destHeight, vitality, time)
  }
}

// ─── 子渲染 ───

function drawBaguaGrid(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  regions: PalmStarsMetrics['regions'],
  _time: number,
): void {
  ctx.save()
  const rows = 3, cols = 3
  const cellW = w / cols
  const cellH = h / rows

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * 3 + col
      const cx = x + col * cellW
      const cy = y + row * cellH

      // 区域能量覆盖色
      const region = regions?.find(r => r.sector !== 'center' && mapRegionToGrid(r.sector) === `${row}-${col}`)
      const energy = region?.energyScore ?? (50 + Math.sin(idx) * 20)

      const isHealthy = energy >= 50
      const alpha = isHealthy ? 0.08 + (energy - 50) * 0.004 : 0.04
      ctx.globalAlpha = alpha
      ctx.fillStyle = isHealthy
        ? BAGUA_COLORS_HEALTHY[idx]
        : BAGUA_COLORS_DEPLETED[idx]
      ctx.fillRect(cx, cy, cellW, cellH)

      // 宫位边界
      ctx.globalAlpha = 0.2
      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = 0.5
      ctx.strokeRect(cx, cy, cellW, cellH)

      // 标签
      if (idx < BAGUA_NAMES.length) {
        ctx.globalAlpha = 0.5
        ctx.font = '9px STKaiti, KaiTi, serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#ffd700'
        ctx.shadowColor = '#ffaa00'
        ctx.shadowBlur = 4
        ctx.fillText(BAGUA_NAMES[idx], cx + cellW / 2, cy + cellH / 2)
      }
    }
  }

  ctx.restore()
}

/** 将 BaguaSector 映射到 0..2×0..2 的九宫格坐标 */
function mapRegionToGrid(sector: string): string {
  const map: Record<string, string> = {
    qian: '2-2', kan: '2-1', gen: '2-0',
    zhen: '1-0', xun: '0-0', li: '0-1',
    kun: '0-2', dui: '1-2',
  }
  return map[sector] ?? '1-1'
}

function drawThenarParticles(
  ctx: CanvasRenderingContext2D,
  handLeft: number, handTop: number,
  handW: number, handH: number,
  _venusMountFullness: number,
  vitality: number,
  time: number,
): void {
  // 大鱼际位置：手掌左下区域
  const thenarCx = handLeft + handW * 0.2
  const thenarCy = handTop + handH * 0.7

  if (time - lastParticleSpawn > 0.15) {
    lastParticleSpawn = time
    const count = Math.floor(_venusMountFullness * 8)
    const color = vitality >= 50 ? '#44ff66' : '#778855'
    const newP = spawnParticles(count, thenarCx, thenarCy, handW * 0.18, [color, '#88ffaa', '#66cc44'], 2.5, 0.4)
    palmParticles = updateParticles([...palmParticles, ...newP], 0, 0, PALM_PARTICLE_MAX)
  }

  palmParticles = updateParticles(palmParticles, 0.016, -0.3, PALM_PARTICLE_MAX)
  renderParticles(ctx, palmParticles, 6)
}

function drawBoneGlow(
  ctx: CanvasRenderingContext2D,
  landmarks: Array<{ x: number; y: number; z?: number }>,
  w: number, h: number,
  _vitality: number,
  _time: number,
): void {
  ctx.save()
  ctx.strokeStyle = '#4488ff'
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.35
  ctx.shadowColor = '#4488ff'
  ctx.shadowBlur = 10

  for (const [a, b] of HAND_BONES) {
    ctx.beginPath()
    ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h)
    ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h)
    ctx.stroke()
  }

  ctx.restore()
}

function drawJointPulses(
  ctx: CanvasRenderingContext2D,
  landmarks: Array<{ x: number; y: number; z?: number }>,
  w: number, h: number,
  time: number,
): void {
  ctx.save()

  for (const finger of JOINT_INDICES) {
    for (const idx of [finger.mcp, finger.pip, finger.dip]) {
      if (!landmarks[idx]) continue
      const px = landmarks[idx].x * w
      const py = landmarks[idx].y * h
      const pulse = 0.5 + Math.sin(time * 6 + idx) * 0.5

      // 红点辉光
      ctx.globalAlpha = 0.4 * pulse
      ctx.shadowColor = '#ff2222'
      ctx.shadowBlur = 12 * pulse

      const r = 3 + pulse * 2
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fillStyle = '#ff4444'
      ctx.fill()
    }
  }

  ctx.restore()
}

function drawNoHandHint(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  _vitality: number,
  _time: number,
): void {
  ctx.save()
  ctx.font = '13px STKaiti, KaiTi, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#666688'
  ctx.globalAlpha = 0.4
  ctx.fillText('请将手掌面向摄像头', w / 2, h / 2)

  const hint = _vitality >= 50 ? '掌色平和，运势稳健' : '掌心暗淡，气血需调'
  ctx.fillText(hint, w / 2, h / 2 + 24)

  ctx.restore()
}
