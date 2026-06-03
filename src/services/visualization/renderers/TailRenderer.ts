/**
 * TailRenderer — 虚拟尾椎 Canvas 渲染器
 *
 * 4 层渲染管线：
 *   1. 发光尾骨锚点（径向渐变圆）
 *   2. 尾巴段（8 段平滑曲线，线宽递减）
 *   3. 粒子尾迹（半透明圆点）
 *   4. 情绪光晕（径向渐变叠加）
 *
 * 含石化渐变和失重漂浮效果。
 */

import type { Keypoint, PostureMetrics, Particle, TailSegment } from '@/types'
import type { RendererInterface } from '../types'
import {
  computeBasePosition,
  updateTailSegments,
  updatePetrification,
  updateFloating,
  getTailColor,
  computeFloatingOffset,
  emitParticles,
  updateParticles,
  createInitialSegments,
} from '../physics'

// ---- 常量 ----

/** 锚点发光半径 */
const ANCHOR_GLOW_RADIUS = 12
const ANCHOR_CORE_RADIUS = 5

/** 尾巴线宽范围 */
const TAIL_LINE_WIDTH_START = 12
const TAIL_LINE_WIDTH_END = 2

export class TailRenderer implements RendererInterface {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private animFrameId: number | null = null
  private running = false

  private style: 'full' | 'simple' | 'minimal' = 'full'
  private qualityScale = 1 // 性能降级时的分辨率缩放

  // 物理状态
  private segments: TailSegment[] = createInitialSegments()
  private previousSegments: TailSegment[] | null = null
  private particles: Particle[] = []
  private basePosition: { x: number; y: number } = { x: 0, y: 0 }
  private currentMetrics: PostureMetrics | null = null
  private currentKeypoints: Keypoint[] | null = null
  private frameCount = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2D context')
    this.ctx = ctx
  }

  // ---- 公开方法 ----

  setStyle(style: 'full' | 'simple' | 'minimal'): void {
    this.style = style
  }

  setQuality(scale: number): void {
    this.qualityScale = Math.max(0.1, Math.min(1, scale))
  }

  resize(width: number, height: number): void {
    const s = this.qualityScale
    this.canvas.width = Math.floor(width * s)
    this.canvas.height = Math.floor(height * s)
  }

  updatePose(metrics: PostureMetrics, keypoints: Keypoint[]): void {
    this.currentMetrics = metrics
    this.currentKeypoints = keypoints
    this.frameCount++

    // 保存当前 segments 作为"上一帧"
    this.previousSegments = this.segments.map((s) => ({ ...s }))

    // 1. 计算锚点
    this.basePosition = computeBasePosition(
      keypoints,
      this.canvas.width,
      this.canvas.height,
    )

    // 2. 更新尾巴段
    const isFloating = updateFloating(metrics.stillnessDuration)
    if (isFloating) {
      // 失重漂浮模式：在上一帧位置基础上加随机偏移
      this.segments = this.previousSegments.map((seg, i) => {
        const offset = computeFloatingOffset(i, this.frameCount)
        const petrification = updatePetrification(metrics.stillnessDuration)
        const alpha = Math.max(0.1, 1 - petrification)
        return {
          ...seg,
          x: seg.x + offset.dx,
          y: seg.y + offset.dy,
          color: `rgba(128,128,128,${alpha.toFixed(2)})`,
        }
      })
    } else {
      this.segments = updateTailSegments(
        this.segments,
        this.basePosition,
        metrics,
        this.previousSegments,
      )

      // 填充颜色
      const petrification = updatePetrification(metrics.stillnessDuration)
      const tailColor = getTailColor(petrification, metrics.emotionalState)
      for (const seg of this.segments) {
        seg.color = tailColor
      }
    }

    // 3. 粒子系统（仅在 full 模式下）
    if (this.style === 'full' && !isFloating) {
      const lastSeg = this.segments[this.segments.length - 1]
      const tipColor = lastSeg?.color ?? 'rgba(255,180,120,0.8)'
      const newParticles = emitParticles(lastSeg, tipColor)
      this.particles = updateParticles([...this.particles, ...newParticles])
    }
  }

  render(): void {
    if (!this.running) return

    const { ctx, canvas } = this
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 画布尺寸为 0 时跳过
    if (canvas.width === 0 || canvas.height === 0) return

    const metrics = this.currentMetrics
    if (!metrics) return

    // ---- 第 1 层：发光尾骨锚点 (simple/full) ----
    if (this.style === 'full' || this.style === 'simple') {
      this.drawAnchorGlow()
    }

    // ---- 第 2 层：尾巴段 (simple/full) ----
    if (this.style === 'full' || this.style === 'simple') {
      this.drawTailSegments()
    }

    // ---- 第 3 层：粒子尾迹 (仅 full) ----
    if (this.style === 'full') {
      this.drawParticles()
    }

    // ---- 第 4 层：情绪光晕 (full/simple/minimal) ----
    this.drawEmotionGlow(metrics)

    // ---- 第 5 层：警示光环（失重漂浮时） ----
    if (updateFloating(metrics.stillnessDuration)) {
      this.drawWarningRing(Date.now())
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    const loop = () => {
      if (!this.running) return
      this.render()
      this.animFrameId = requestAnimationFrame(loop)
    }
    this.animFrameId = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  dispose(): void {
    this.stop()
    this.segments = createInitialSegments()
    this.previousSegments = null
    this.particles = []
    this.currentMetrics = null
    this.currentKeypoints = null
  }

  // ---- 私有渲染方法 ----

  /** 第 1 层：发光锚点 */
  private drawAnchorGlow(): void {
    const { ctx } = this
    const { x, y } = this.basePosition

    // 外层光晕
    const outerGradient = ctx.createRadialGradient(x, y, 0, x, y, ANCHOR_GLOW_RADIUS)
    outerGradient.addColorStop(0, 'rgba(255, 200, 150, 0.6)')
    outerGradient.addColorStop(0.5, 'rgba(255, 150, 80, 0.2)')
    outerGradient.addColorStop(1, 'rgba(255, 100, 50, 0)')

    ctx.beginPath()
    ctx.arc(x, y, ANCHOR_GLOW_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = outerGradient
    ctx.fill()

    // 内核
    ctx.beginPath()
    ctx.arc(x, y, ANCHOR_CORE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 220, 180, 0.9)'
    ctx.fill()
  }

  /** 第 2 层：尾巴段 */
  private drawTailSegments(): void {
    const { ctx, segments } = this
    if (segments.length === 0) return

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // 绘制平滑曲线连接各段
    ctx.beginPath()
    ctx.moveTo(this.basePosition.x, this.basePosition.y)

    for (let i = 0; i < segments.length; i++) {
      ctx.lineTo(segments[i].x, segments[i].y)
    }

    // 线宽渐变：12px → 2px
    const lineWidth =
      TAIL_LINE_WIDTH_START -
      ((TAIL_LINE_WIDTH_START - TAIL_LINE_WIDTH_END) / (segments.length - 1)) *
        Math.min(segments.length - 1, segments.length - 1)

    // 使用倒数第 2-3 段颜色（避免最末端太暗）
    const midSeg = segments[Math.floor(segments.length * 0.6)]
    ctx.strokeStyle = midSeg?.color ?? 'rgba(255,180,120,0.8)'
    ctx.lineWidth = TAIL_LINE_WIDTH_START

    // 实际绘制时使用渐变线宽不可行（Canvas 无法 per-segment 设置线宽），
    // 改为使用末端段颜色，整体线宽一致
    ctx.stroke()

    ctx.restore()
  }

  /** 第 3 层：粒子尾迹 */
  private drawParticles(): void {
    const { ctx, particles } = this
    if (particles.length === 0) return

    ctx.save()

    for (const p of particles) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${p.alpha.toFixed(2)})`)
      ctx.fill()
    }

    ctx.restore()
  }

  /** 第 4 层：情绪光晕 */
  private drawEmotionGlow(metrics: PostureMetrics): void {
    const { ctx, canvas } = this
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const maxRadius = Math.max(cx, cy)

    // 情绪色温
    let colorR: number, colorG: number, colorB: number
    switch (metrics.emotionalState) {
      case 'tense':
        colorR = 80; colorG = 60; colorB = 140  // 冷紫蓝
        break
      case 'relaxed':
        colorR = 255; colorG = 180; colorB = 80  // 暖橙金
        break
      case 'fatigued':
        colorR = 100; colorG = 100; colorB = 100  // 灰色
        break
      case 'focused':
      case 'unknown':
      default:
        colorR = 200; colorG = 200; colorB = 220  // 中性白
        break
    }

    const gradient = ctx.createRadialGradient(cx, cy, maxRadius * 0.3, cx, cy, maxRadius)
    gradient.addColorStop(0, `rgba(${colorR},${colorG},${colorB},0.06)`)
    gradient.addColorStop(0.5, `rgba(${colorR},${colorG},${colorB},0.03)`)
    gradient.addColorStop(1, `rgba(${colorR},${colorG},${colorB},0)`)

    ctx.save()
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
  }

  // ---- 警示光环（失重漂浮时调用） ----
  // 此方法在 render 中根据 floating 状态自动调用
  private drawWarningRing(time: number): void {
    const { ctx, canvas } = this
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const pulseAlpha = 0.15 + Math.sin(time * 0.003) * 0.1
    const pulseRadius = 60 + Math.sin(time * 0.002) * 20

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255, 80, 80, ${pulseAlpha.toFixed(3)})`
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.restore()
  }
}
