/**
 * 脊柱「生命之树」隐喻渲染器
 *
 * 从脊柱关键点 + 健康指标直接绘制：
 *   - 金色藤蔓（Catmull-Rom 贝塞尔曲线沿 spineLine）
 *   - 3 节点（C7/T12/L5）条件变异：花朵/锁链/水波纹
 *   - 八卦旋转光环（流畅态）
 *   - 太极图（堵塞态）
 *   - 能量粒子上涌
 */

import {
  extractSpineLine,
  cubicBezierSmooth,
} from './bezierUtils'
import {
  spawnParticles,
  updateParticles,
  renderParticles,
  type Particle,
} from './particleEngine'
import type {
  SpineMetrics,
  SpineEnergy,
} from '../types/physiognomy'
import type { Keypoint } from '../types'

// ─── 视觉常量 ───

const NODE_LABELS = ['百会', '天柱 C7', '灵台 T12', '命门 L5', '尾闾'] as const

const VINE_COLORS: Record<string, { stem: string; leaf: string; flower: string }> = {
  flowing: { stem: '#ffd700', leaf: '#66ff88', flower: '#ffaa44' },
  blocked: { stem: '#666688', leaf: '#556644', flower: '#886644' },
  diminished: { stem: '#555577', leaf: '#445544', flower: '#775533' },
} as const

const BAGUA_TRIGRAMS = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷']

// 持久粒子池
let spineParticles: Particle[] = []
let lastSpawnTime = 0
const PARTICLE_SPAWN_INTERVAL = 0.25
const PARTICLE_MAX = 120

// ─── 公共 API ───

export function renderSpineTree(
  ctx: CanvasRenderingContext2D,
  destWidth: number,
  destHeight: number,
  spineMetrics: SpineMetrics | null,
  spineEnergy: SpineEnergy | null,
  keypoints: Keypoint[] | null,
  time: number,
): void {
  ctx.clearRect(0, 0, destWidth, destHeight)

  // 定位脊柱线
  const rawLine = extractSpineLine(keypoints, destWidth, destHeight)
  const state = spineEnergy?.state ?? 'flowing'
  const lateralCurvature = spineMetrics?.lateralCurvature ?? 0
  const score = spineMetrics?.overallScore ?? 80
  const blockedAt = spineEnergy?.blockedAt ?? null

  // 侧弯偏移
  const spineNodes = rawLine.map((pt, _i) => {
    return { x: pt.x, y: pt.y }
  })

  const smoothSpine = cubicBezierSmooth(spineNodes, 0.35)
  const colors = VINE_COLORS[state]

  // ── Layer 0: 放射底辉 ──
  drawRadialGlow(ctx, destWidth, destHeight, spineNodes, state, time)

  // ── Layer 1: 藤蔓主干 ──
  drawVine(ctx, smoothSpine, colors, state, lateralCurvature, time)

  // ── Layer 2: 节点 (C7/T12/L5/百会/尾闾) ──
  const nodesY = [
    spineNodes[0],  // 百会
    spineNodes[1],  // C7
    spineNodes[2],  // T12
    spineNodes[3],  // L5
    spineNodes[4],  // 尾闾
  ]
  const nodeLabels = NODE_LABELS
  const segmentMap = [null, 'cervical', 'thoracic', 'lumbar', null]
  for (let i = 0; i < nodesY.length; i++) {
    const isBlocked = segmentMap[i] === blockedAt
    drawNode(ctx, nodesY[i], nodeLabels[i], i, colors, state, isBlocked, time)
  }

  // ── Layer 3: 侧弯水波纹 ──
  if (lateralCurvature > 0.15) {
    drawWaterRipple(ctx, smoothSpine, lateralCurvature, time)
  }

  // ── Layer 4: 八卦光圈（流畅态） ──
  if (state === 'flowing' && score >= 60) {
    const cx = destWidth / 2
    const cy = destHeight / 2
    drawBaguaRing(ctx, cx, cy, time)
  }

  // ── Layer 5: 太极图（堵塞态） ──
  if (state === 'blocked' || state === 'diminished') {
    const cx = destWidth / 2
    const cy = destHeight * 0.25
    drawTaiji(ctx, cx, cy, state, time)
  }

  // ── Layer 6: 能量粒子 ──
  drawEnergyParticles(ctx, smoothSpine, colors.stem, state, time)

  // ── Layer 7: 评分标签 ──
  drawScoreLabel(ctx, destWidth, spineMetrics, state, time)
}

// ─── 子渲染函数 ───

function drawRadialGlow(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  nodes: Array<{ x: number; y: number }>,
  state: string,
  _time: number,
): void {
  const cx = nodes.length > 0 ? nodes[2]?.x ?? w / 2 : w / 2
  const cy = nodes.length > 0 ? nodes[2]?.y ?? h * 0.5 : h * 0.5
  const r = Math.max(w, h) * 0.7

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  if (state === 'flowing') {
    grad.addColorStop(0, 'rgba(255,180,40,0.12)')
    grad.addColorStop(0.5, 'rgba(255,140,20,0.04)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
  } else {
    grad.addColorStop(0, 'rgba(100,100,140,0.08)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

function drawVine(
  ctx: CanvasRenderingContext2D,
  curve: Array<{ x: number; y: number }>,
  colors: typeof VINE_COLORS['flowing'],
  state: string,
  lateralCurvature: number,
  time: number,
): void {
  if (curve.length < 2) return

  ctx.save()
  const pulse = 0.9 + Math.sin(time * 2) * 0.1

  // 辉光 pass
  ctx.lineWidth = 10
  ctx.strokeStyle = colors.stem
  ctx.globalAlpha = 0.25 * pulse
  ctx.shadowColor = colors.stem
  ctx.shadowBlur = 30
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  ctx.moveTo(curve[0].x, curve[0].y)
  for (let i = 1; i < curve.length; i++) {
    ctx.lineTo(curve[i].x, curve[i].y)
  }
  ctx.stroke()

  // 主干 pass
  ctx.lineWidth = 3 + (state === 'flowing' ? 1.5 : 0)
  ctx.strokeStyle = colors.stem
  ctx.globalAlpha = 0.75 * pulse
  ctx.shadowColor = colors.stem
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.moveTo(curve[0].x, curve[0].y)
  for (let i = 1; i < curve.length; i++) {
    ctx.lineTo(curve[i].x, curve[i].y)
  }
  ctx.stroke()

  // 细线 pass
  const isBlocked = state !== 'flowing'
  if (!isBlocked) {
    ctx.lineWidth = 1
    ctx.strokeStyle = '#fffde0'
    ctx.globalAlpha = 0.6 * pulse
    ctx.shadowBlur = 0
    ctx.beginPath()
    ctx.moveTo(curve[0].x, curve[0].y)
    for (let i = 1; i < curve.length; i++) {
      ctx.lineTo(curve[i].x, curve[i].y)
    }
    ctx.stroke()
  }

  // 坏体态：灰色锁链效果（沿藤蔓画间断短线）
  if (isBlocked && lateralCurvature < 0.5) {
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#889'
    ctx.globalAlpha = 0.5
    ctx.shadowBlur = 6
    for (let i = 0; i < curve.length - 4; i += 8) {
      const a = curve[i]
      const b = curve[Math.min(i + 4, curve.length - 1)]
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  ctx.restore()
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  label: string,
  index: number,
  colors: typeof VINE_COLORS['flowing'],
  state: string,
  isBlocked: boolean,
  time: number,
): void {
  const isHealthy = state === 'flowing' && !isBlocked
  const pulse = 0.8 + Math.sin(time * 2.5 + index) * 0.2

  ctx.save()

  if (isHealthy) {
    // 盛开的花：多层花瓣
    const petalCount = 6
    const baseR = 10 + index * 2
    for (let layer = 0; layer < 3; layer++) {
      const r = baseR - layer * 3
      if (r <= 0) continue
      const alpha = (0.7 - layer * 0.2) * pulse
      ctx.globalAlpha = alpha
      ctx.fillStyle = layer === 0 ? colors.flower : (layer === 1 ? '#fffde0' : '#ff8844')

      ctx.beginPath()
      for (let p = 0; p < petalCount; p++) {
        const angle = (p / petalCount) * Math.PI * 2 + time * 0.3
        const pr = r * (0.8 + 0.2 * Math.sin(time + p))
        ctx.save()
        ctx.translate(pos.x, pos.y)
        ctx.rotate(angle)
        ctx.ellipse(pr * 0.6, 0, pr * 0.4, pr * 0.15, 0, 0, Math.PI * 2)
        ctx.restore()
      }
      ctx.fill()
    }
  } else {
    // 枯萎花 / 锁链结
    ctx.globalAlpha = 0.5 * pulse
    if (isBlocked && index < 4) {
      // 锁链结
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 2.5
      ctx.shadowColor = '#555'
      ctx.shadowBlur = 8
      for (let r = 3; r <= 9; r += 3) {
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      // 打结标记：X 交叉线
      ctx.lineWidth = 1.5
      ctx.strokeStyle = '#ff4444'
      ctx.shadowColor = '#ff0000'
      ctx.beginPath()
      ctx.moveTo(pos.x - 8, pos.y - 8)
      ctx.lineTo(pos.x + 8, pos.y + 8)
      ctx.moveTo(pos.x + 8, pos.y - 8)
      ctx.lineTo(pos.x - 8, pos.y + 8)
      ctx.stroke()
    } else {
      // 枯萎花
      ctx.fillStyle = '#886644'
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 节点标签
  ctx.shadowBlur = 0
  ctx.font = '11px STKaiti, KaiTi, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = isHealthy ? '#ffd700' : '#888'
  ctx.globalAlpha = 0.7 * pulse
  ctx.fillText(label, pos.x, pos.y - (isHealthy ? 16 : 10))

  ctx.restore()
}

function drawWaterRipple(
  ctx: CanvasRenderingContext2D,
  curve: Array<{ x: number; y: number }>,
  curvature: number,
  time: number,
): void {
  if (curvature <= 0.15) return
  ctx.save()

  const intensity = Math.min(1, curvature / 0.5)
  ctx.globalAlpha = 0.25 * intensity
  ctx.strokeStyle = '#4488ff'
  ctx.lineWidth = 2
  ctx.shadowColor = '#4488ff'
  ctx.shadowBlur = 15

  // 在藤蔓两侧画波浪线
  for (let side = 0; side < 2; side++) {
    const dir = side === 0 ? 1 : -1
    ctx.beginPath()
    for (let i = 0; i < curve.length; i++) {
      const pt = curve[i]
      const off = Math.sin(pt.y * 0.03 + time * 2) * 25 * intensity * dir
      if (i === 0) ctx.moveTo(pt.x + off, pt.y)
      else ctx.lineTo(pt.x + off, pt.y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

function drawBaguaRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  time: number,
): void {
  ctx.save()
  const radius = 130
  const rotation = time * 0.3

  // 光环
  ctx.globalAlpha = 0.15
  ctx.strokeStyle = '#ffd700'
  ctx.lineWidth = 1.5
  ctx.shadowColor = '#ffaa00'
  ctx.shadowBlur = 20
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()

  // 八卦符号
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + rotation
    const bx = cx + Math.cos(angle) * radius
    const by = cy + Math.sin(angle) * radius

    ctx.globalAlpha = 0.5
    ctx.shadowBlur = 8
    ctx.font = '18px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffd700'
    ctx.fillText(BAGUA_TRIGRAMS[i], bx, by)
  }

  ctx.restore()
}

function drawTaiji(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  state: string,
  time: number,
): void {
  ctx.save()
  const r = 35
  const rotation = time * 0.5
  ctx.translate(cx, cy)
  ctx.rotate(rotation)

  const alpha = state === 'blocked' ? 0.25 : 0.15
  ctx.globalAlpha = alpha

  // 外环
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.strokeStyle = '#999'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // 阴阳鱼
  // 阳（白）—— 简化绘制
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI, false)
  ctx.arc(0, -r / 2, r / 2, 0, Math.PI, true)
  ctx.fillStyle = '#ddd'
  ctx.fill()

  // 阴（黑）—— 简化绘制
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI, true)
  ctx.arc(0, r / 2, r / 2, 0, Math.PI, false)
  ctx.fillStyle = '#333'
  ctx.fill()

  // 双点
  ctx.beginPath()
  ctx.arc(0, -r / 2, 3, 0, Math.PI * 2)
  ctx.fillStyle = '#333'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(0, r / 2, 3, 0, Math.PI * 2)
  ctx.fillStyle = '#ddd'
  ctx.fill()

  ctx.restore()
}

function drawEnergyParticles(
  ctx: CanvasRenderingContext2D,
  curve: Array<{ x: number; y: number }>,
  color: string,
  state: string,
  time: number,
): void {
  // 粒子生成
  if (time - lastSpawnTime > PARTICLE_SPAWN_INTERVAL) {
    lastSpawnTime = time
    const count = state === 'flowing' ? 12 : state === 'blocked' ? 4 : 2
    const idx = Math.floor(Math.random() * curve.length)
    const origin = curve[Math.min(idx, curve.length - 1)]

    const newP = spawnParticles(count, origin.x, origin.y, 25, [color, '#fffde0', '#ffcc66'], 2.5, 0.6)
    spineParticles = updateParticles([...spineParticles, ...newP], 0, 0, PARTICLE_MAX)
  }

  // 粒子更新 + 渲染
  spineParticles = updateParticles(spineParticles, 0.016, -0.5, PARTICLE_MAX)
  renderParticles(ctx, spineParticles, 8)
}

function drawScoreLabel(
  ctx: CanvasRenderingContext2D,
  w: number,
  spineMetrics: SpineMetrics | null,
  _state: string,
  _time: number,
): void {
  if (!spineMetrics) return
  const score = spineMetrics.overallScore
  const label = score >= 80 ? '龙骨挺拔' : score >= 50 ? '气机不畅' : '能量淤堵'
  const color = score >= 80 ? '#ffd700' : score >= 50 ? '#ffaa44' : '#ff6644'

  ctx.save()
  ctx.font = '14px STKaiti, KaiTi, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.fillStyle = color
  ctx.globalAlpha = 0.8
  ctx.fillText(`${label} · ${score}分`, w / 2, 8)
  ctx.restore()
}
