/**
 * 骨相「面相透射」隐喻渲染器
 *
 * 基于面部 478 关键点 + 骨相分析指标绘制：
 *   - 风格化颅骨轮廓覆盖（眼眶、鼻洞、颧弓、下颌）
 *   - 额头 sunrise 光弧（foreheadFullness 驱动）
 *   - 颧骨悬崖/鹰隐喻（cheekboneProminence 驱动）
 *   - 下颌磐石隐喻（jawAngle 驱动）
 *   - 面廓金边描边
 */

import {
  computeSkullWireframe,
  scaleSkullToCanvas,
  drawPolygonPath,
} from './skullGeometry'
import type { BonePhysiognomyMetrics } from '../types/physiognomy'

// ─── 视觉常量 ───

const SKULL_COLORS = {
  eyeSocket: '#886655',
  noseBridge: '#998866',
  zygomatic: '#aa8855',
  maxilla: '#887766',
  mandible: '#997755',
} as const

// ─── 公共 API ───

/**
 * @param ctx            目标 Canvas 2D
 * @param destWidth      画布宽度
 * @param destHeight     画布高度
 * @param boneMetrics    骨相指标
 * @param faceLandmarks  MediaPipe Face 478 点归一化 [0~1]
 * @param time           动画时间 (秒)
 */
export function renderBonePhysiognomy(
  ctx: CanvasRenderingContext2D,
  destWidth: number,
  destHeight: number,
  boneMetrics: BonePhysiognomyMetrics | null,
  faceLandmarks: Array<{ x: number; y: number; z: number; visibility?: number }> | null,
  time: number,
): void {
  ctx.clearRect(0, 0, destWidth, destHeight)

  const skull = computeSkullWireframe(faceLandmarks)

  if (skull) {
    const scaled = scaleSkullToCanvas(skull, destWidth, destHeight)

    const foreheadFullness  = boneMetrics?.foreheadFullness ?? 0.5
    const cheekboneProm     = boneMetrics?.cheekboneProminence ?? 0.5
    const jawAngle          = boneMetrics?.jawAngle ?? 130
    const faceShape         = boneMetrics?.faceShape ?? 'oval'

    // ── 1. 颅骨框架描边 ──
    drawSkullFrame(ctx, scaled)

    // ── 2. 额头 sunrise ──
    drawForeheadSunrise(ctx, scaled, foreheadFullness, destWidth, destHeight, time)

    // ── 3. 颧骨悬崖/鹰 ──
    drawCheekboneMetaphor(ctx, scaled, cheekboneProm, destWidth, destHeight, time)

    // ── 4. 下颌磐石 ──
    drawJawBoulder(ctx, scaled, jawAngle, destWidth, destHeight, time)

    // ── 5. 面廓金边 ──
    drawFaceGoldenOutline(ctx, scaled, destWidth, destHeight)

    // ── 6. 脸型标签 ──
    drawFaceShapeLabel(ctx, faceShape, destWidth, destHeight, time)
  }
}

// ─── 子渲染 ───

function drawSkullFrame(
  ctx: CanvasRenderingContext2D,
  skull: ReturnType<typeof scaleSkullToCanvas>,
): void {
  ctx.save()
  ctx.globalAlpha = 0.22

  // 眼眶 — 深色填充
  ctx.fillStyle = SKULL_COLORS.eyeSocket
  drawPolygonPath(ctx, skull.leftEyeSocket)
  ctx.fill()
  drawPolygonPath(ctx, skull.rightEyeSocket)
  ctx.fill()

  // 鼻腔
  ctx.fillStyle = SKULL_COLORS.noseBridge
  drawPolygonPath(ctx, skull.noseBridge)
  ctx.fill()

  // 颧弓 — 描边
  ctx.strokeStyle = SKULL_COLORS.zygomatic
  ctx.lineWidth = 2
  drawPolygonPath(ctx, skull.leftZygomatic)
  ctx.stroke()
  drawPolygonPath(ctx, skull.rightZygomatic)
  ctx.stroke()

  // 上颌
  ctx.strokeStyle = SKULL_COLORS.maxilla
  ctx.lineWidth = 1.5
  drawPolygonPath(ctx, skull.maxilla)
  ctx.stroke()

  // 下颌 — 粗线
  ctx.strokeStyle = SKULL_COLORS.mandible
  ctx.lineWidth = 3
  ctx.shadowColor = '#997755'
  ctx.shadowBlur = 12
  drawPolygonPath(ctx, skull.mandible)
  ctx.stroke()

  ctx.restore()
}

function drawForeheadSunrise(
  ctx: CanvasRenderingContext2D,
  skull: ReturnType<typeof scaleSkullToCanvas>,
  fullness: number,
  _w: number,
  _h: number,
  time: number,
): void {
  ctx.save()

  // 额头中心 = 左右眼眶上沿中点
  const leftTop = skull.leftEyeSocket[0] ?? skull.leftEyeSocket[skull.leftEyeSocket.length - 1]
  const rightTop = skull.rightEyeSocket[0] ?? skull.rightEyeSocket[skull.rightEyeSocket.length - 1]
  if (!leftTop || !rightTop) { ctx.restore(); return }

  const fcx = (leftTop.x + rightTop.x) / 2
  const fcy = Math.min(leftTop.y, rightTop.y) - 20 * fullness
  const baseR = 25 + fullness * 50

  // 多层弧线
  for (let i = 0; i < 5; i++) {
    const r = baseR + i * 12
    const alpha = (0.4 - i * 0.07) * fullness
    if (alpha <= 0) break

    ctx.globalAlpha = alpha
    ctx.strokeStyle = '#ffaa44'
    ctx.lineWidth = 1.5
    ctx.shadowColor = '#ff8844'
    ctx.shadowBlur = 20 * fullness

    ctx.beginPath()
    ctx.arc(fcx, fcy + r * 0.3, r, Math.PI * 1.1, Math.PI * 1.9)
    ctx.stroke()
  }

  // 旭日文字
  if (fullness > 0.6) {
    ctx.globalAlpha = 0.5 + Math.sin(time * 1.5) * 0.15
    ctx.font = '12px STKaiti, KaiTi, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = '#ffaa44'
    ctx.shadowBlur = 12
    ctx.fillText('天庭饱满', fcx, fcy - baseR - 8)
  }

  ctx.restore()
}

function drawCheekboneMetaphor(
  ctx: CanvasRenderingContext2D,
  skull: ReturnType<typeof scaleSkullToCanvas>,
  prominence: number,
  _w: number,
  _h: number,
  time: number,
): void {
  if (prominence < 0.3) return
  ctx.save()

  // 取颧弓中点作为悬崖位置
  for (const side of [skull.leftZygomatic, skull.rightZygomatic]) {
    if (side.length < 3) continue
    const mid = side[Math.floor(side.length / 2)]
    const cx = mid.x
    const cy = mid.y

    if (prominence > 0.6) {
      // 悬崖峭壁 — 锐角三角
      const scale = prominence * 30
      ctx.globalAlpha = 0.3
      ctx.fillStyle = '#8b7355'
      ctx.strokeStyle = '#a08855'
      ctx.lineWidth = 2
      ctx.shadowColor = '#665544'
      ctx.shadowBlur = 10

      ctx.beginPath()
      ctx.moveTo(cx, cy - scale * 1.5)
      ctx.lineTo(cx - scale * 0.8, cy + scale * 0.5)
      ctx.lineTo(cx + scale * 0.8, cy + scale * 0.5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // 孤鹰
      const wingFlap = Math.sin(time * 2.5) * 5
      ctx.strokeStyle = '#aa8855'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx + 8 + wingFlap, cy - scale * 0.8)
      ctx.lineTo(cx + 20, cy - scale)
      ctx.moveTo(cx + 8 - wingFlap, cy - scale * 0.8)
      ctx.lineTo(cx - 4, cy - scale)
      ctx.stroke()
    } else {
      // 温和隆骨
      ctx.globalAlpha = 0.15
      ctx.beginPath()
      ctx.arc(cx, cy, prominence * 20, 0, Math.PI * 2)
      ctx.fillStyle = '#997755'
      ctx.fill()
    }
  }

  if (prominence > 0.6) {
    ctx.globalAlpha = 0.4
    ctx.font = '10px STKaiti, KaiTi, serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#aa8855'
    ctx.shadowBlur = 6
    const labelCx = (_w + (skull.leftZygomatic[0]?.x ?? 0) * 0.3 + (skull.rightZygomatic[0]?.x ?? _w) * 0.3) / 2
    ctx.fillText('掌控力强 · 防孤傲', labelCx, _h * 0.28)
  }

  ctx.restore()
}

function drawJawBoulder(
  ctx: CanvasRenderingContext2D,
  skull: ReturnType<typeof scaleSkullToCanvas>,
  jawAngle: number,
  _w: number,
  _h: number,
  time: number,
): void {
  ctx.save()

  const mandible = skull.mandible
  if (mandible.length < 3) { ctx.restore(); return }

  // 下颌中心 ≈ mandible 中点
  const mid = mandible[Math.floor(mandible.length / 2)]
  const cx = mid.x
  const cy = mid.y + 15

  if (jawAngle > 130) {
    // 方形磐石
    const sz = 18 + (jawAngle - 130) * 0.8
    ctx.globalAlpha = 0.2
    ctx.fillStyle = '#776655'
    ctx.strokeStyle = '#998877'
    ctx.lineWidth = 2
    ctx.shadowColor = '#554433'
    ctx.shadowBlur = 15

    const rockMotion = Math.sin(time * 0.8) * 2
    ctx.beginPath()
    ctx.moveTo(cx - sz, cy - sz + rockMotion)
    ctx.lineTo(cx + sz, cy - sz - rockMotion)
    ctx.lineTo(cx + sz, cy + sz - rockMotion)
    ctx.lineTo(cx - sz, cy + sz + rockMotion)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.globalAlpha = 0.35
    ctx.font = '10px STKaiti, KaiTi, serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#998877'
    ctx.shadowBlur = 6
    ctx.fillText('毅力与晚运', cx, cy + sz + 16)
  } else if (jawAngle < 105) {
    // 锐角石
    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#886655'
    ctx.beginPath()
    ctx.moveTo(cx, cy - 20)
    ctx.lineTo(cx - 12, cy + 10)
    ctx.lineTo(cx + 12, cy + 10)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}

function drawFaceGoldenOutline(
  ctx: CanvasRenderingContext2D,
  skull: ReturnType<typeof scaleSkullToCanvas>,
  _w: number,
  _h: number,
): void {
  ctx.save()

  const allPoints = [
    ...skull.mandible,
    ...skull.maxilla.slice().reverse(),
    ...skull.rightZygomatic,
    ...skull.leftZygomatic.slice().reverse(),
    ...skull.noseBridge,
  ]

  if (allPoints.length < 3) { ctx.restore(); return }

  // 三层金边
  for (let pass = 0; pass < 3; pass++) {
    ctx.globalAlpha = pass === 0 ? 0.12 : pass === 1 ? 0.35 : 0.6
    ctx.lineWidth = pass === 0 ? 8 : pass === 1 ? 3 : 1
    ctx.strokeStyle = '#ffd700'
    ctx.shadowColor = '#ffaa00'
    ctx.shadowBlur = pass === 0 ? 20 : pass === 1 ? 8 : 0

    ctx.beginPath()
    ctx.moveTo(allPoints[0].x, allPoints[0].y)
    for (let i = 1; i < allPoints.length; i++) {
      ctx.lineTo(allPoints[i].x, allPoints[i].y)
    }
    ctx.closePath()
    ctx.stroke()
  }

  ctx.restore()
}

function drawFaceShapeLabel(
  ctx: CanvasRenderingContext2D,
  faceShape: string,
  _w: number,
  h: number,
  _time: number,
): void {
  const labels: Record<string, string> = {
    round: '圆润·福相',
    square: '方正·毅力',
    oval: '鹅蛋·清秀',
    diamond: '菱形·灵动',
    triangle: '三角·敏锐',
  }

  const label = labels[faceShape] ?? faceShape
  ctx.save()
  ctx.font = '12px STKaiti, KaiTi, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = '#ffd700'
  ctx.shadowColor = '#ffaa00'
  ctx.shadowBlur = 10
  ctx.globalAlpha = 0.5
  ctx.fillText(label, _w / 2, h - 28)
  ctx.restore()
}
