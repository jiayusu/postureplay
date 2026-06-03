/**
 * Canvas 2D Rutt/Etra-style palm topology wireframe renderer
 *
 * Creates a topographic map of the palm where brighter (fleshier) areas
 * rise like hills in a 3D wireframe relief. Inspired by C-Trend Live.
 *
 * Builds on the core wireframeRelief.ts renderer, adding:
 *   - Palm-centric crop framing
 *   - Multi-layer topographic rendering
 *   - Venus mount radial highlight
 *   - Bagua (Eight Trigrams) symbol overlay
 *   - Chinese calligraphy status text
 */

import {
  renderWireframeRelief,
  getVideoImageData,
} from './wireframeRelief'
import type {
  ReliefParams,
  WireframeLayer,
  WireframeReliefOptions,
} from './wireframeRelief'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Clamp a value to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/** Draw a rounded rectangle path using ctx.arcTo for broad compat. */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

// ──────────────────────────────────────────────
// Main render function
// ──────────────────────────────────────────────

/**
 * Render a Rutt/Etra-style palm relief onto the target canvas.
 *
 * When a MediaPipe-style palm centre is available the renderer crops
 * around it; otherwise it falls back to a centre-bottom default crop.
 * Three wireframe layers are stacked: a thick topographic glow, medium
 * contour lines, and fine structural wires.  An optional Venus-mount
 * radial highlight, a rotating Bagua symbol, and calligraphy label
 * are rendered on top.
 *
 * @param ctx           Target 2D rendering context
 * @param video         Source video element (webcam feed)
 * @param offscreen     Reusable off-screen canvas for ImageData extraction
 * @param destWidth     Target canvas width in pixels
 * @param destHeight    Target canvas height in pixels
 * @param palmCenter    Normalised [0‑1] centre of detected palm, or null
 * @param palmMetrics   Vitality score & Venus-mount fullness, or null
 * @param time          Monotonically increasing animation time (seconds)
 */
export function renderPalmRelief(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  offscreen: HTMLCanvasElement,
  destWidth: number,
  destHeight: number,
  palmCenter: { x: number; y: number } | null,
  palmMetrics: { vitalityScore: number; venusMountFullness: number } | null,
  time: number,
): void {
  // ── 1. Compute crop rectangle ──────────────────────────────────────
  let crop: { x: number; y: number; w: number; h: number }

  if (palmCenter) {
    crop = {
      x: clamp(palmCenter.x - 0.12, 0, 1),
      y: clamp(palmCenter.y - 0.08, 0, 1),
      w: 0.24,
      h: 0.30,
    }
    // Re-clamp w/h so crop never exceeds [0,1]
    if (crop.x + crop.w > 1) crop.w = 1 - crop.x
    if (crop.y + crop.h > 1) crop.h = 1 - crop.y
  } else {
    // Fallback: centre-bottom area
    crop = { x: 0.35, y: 0.50, w: 0.30, h: 0.40 }
  }

  // ── 2. Get ImageData from the video at the computed crop ───────────
  const result = getVideoImageData(video, offscreen, crop)
  if (!result) return // video not ready yet

  const { data: imageData, width: srcW, height: srcH } = result

  // ── 3. Clear canvas ────────────────────────────────────────────────
  ctx.clearRect(0, 0, destWidth, destHeight)

  // ── 4. Derive palette from vitality score ──────────────────────────
  const vitality = palmMetrics?.vitalityScore ?? 50
  const warm = vitality > 60

  const colors = {
    glow: warm ? '#ff8833' : '#5577aa',
    contour: warm ? '#ffbb66' : '#6699cc',
    fine: warm ? '#ffddaa' : '#88bbee',
  }

  // ── 5. Shared ReliefParams (crop is identity since ImageData is
  //      already cropped by getVideoImageData) ─────────────────────────
  const reliefCrop = { x: 0, y: 0, w: 1, h: 1 }
  const venus = palmMetrics?.venusMountFullness ?? 0.5

  const reliefParams: ReliefParams = {
    sampleGapX: 3,
    sampleGapY: 2,
    amplitude: (30 + venus * 40) * 1.5,
    baseYOffset: destHeight * 0.75,
    crop: reliefCrop,
  }

  // ── 6. Layer 1 – Topographic glow ──────────────────────────────────
  const layerGlow: WireframeLayer = {
    color: colors.glow,
    lineWidth: 7,
    globalAlpha: 0.4,
    glow: 25,
    glowColor: colors.glow,
    offsetX: 0,
    offsetY: 0,
    horizontalOnly: false,
    displacementScale: 1.0,
  }

  const optsGlow: WireframeReliefOptions = {
    params: reliefParams,
    layers: [layerGlow],
    connectHorizontal: true,
    connectVertical: true,
    verticalConnectGap: 7,
  }

  renderWireframeRelief(ctx, imageData, srcW, srcH, destWidth, destHeight, optsGlow)

  // ── 7. Layer 2 – Contour lines ─────────────────────────────────────
  const layerContour: WireframeLayer = {
    color: colors.contour,
    lineWidth: 2.5,
    globalAlpha: 0.65,
    glow: 10,
    glowColor: colors.contour,
    offsetX: 0,
    offsetY: 0,
    horizontalOnly: false,
    displacementScale: 1.0,
  }

  const optsContour: WireframeReliefOptions = {
    params: reliefParams,
    layers: [layerContour],
    connectHorizontal: true,
    connectVertical: true,
    verticalConnectGap: 3,
  }

  renderWireframeRelief(ctx, imageData, srcW, srcH, destWidth, destHeight, optsContour)

  // ── 8. Layer 3 – Fine wireframe (horizontal only) ──────────────────
  const layerFine: WireframeLayer = {
    color: colors.fine,
    lineWidth: 1.2,
    globalAlpha: 0.85,
    glow: 0,
    glowColor: 'transparent',
    offsetX: 0,
    offsetY: 0,
    horizontalOnly: false,
    displacementScale: 1.0,
  }

  const optsFine: WireframeReliefOptions = {
    params: reliefParams,
    layers: [layerFine],
    connectHorizontal: true,
    connectVertical: false,
    verticalConnectGap: 0, // unused when connectVertical is false
  }

  renderWireframeRelief(ctx, imageData, srcW, srcH, destWidth, destHeight, optsFine)

  // ── 9. Structural frame (rounded-rect border) ──────────────────────
  const frameX = crop.x * destWidth
  const frameY = crop.y * destHeight
  const frameW = crop.w * destWidth
  const frameH = crop.h * destHeight
  const frameRadius = 8

  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.shadowColor = '#ffd700'
  ctx.shadowBlur = 10
  ctx.strokeStyle = '#ffd700'
  ctx.lineWidth = 1.5
  roundedRectPath(ctx, frameX, frameY, frameW, frameH, frameRadius)
  ctx.stroke()
  ctx.restore()

  // ── 10. Venus mount radial highlight ───────────────────────────────
  if (venus > 0.5) {
    const vx = frameX + frameW * 0.3
    const vy = frameY + frameH * 0.5
    const baseRadius = 15 + venus * 20

    // Three concentric circles with decreasing opacity
    ctx.save()
    ctx.shadowColor = '#ffcc66'
    ctx.shadowBlur = 25

    // Outer ring
    ctx.globalAlpha = 0.05
    ctx.beginPath()
    ctx.arc(vx, vy, baseRadius * 1.5, 0, Math.PI * 2)
    ctx.fillStyle = '#ffcc66'
    ctx.fill()

    // Middle ring
    ctx.globalAlpha = 0.15
    ctx.beginPath()
    ctx.arc(vx, vy, baseRadius, 0, Math.PI * 2)
    ctx.fillStyle = '#ffcc66'
    ctx.fill()

    // Inner ring
    ctx.globalAlpha = 0.3
    ctx.beginPath()
    ctx.arc(vx, vy, baseRadius * 0.5, 0, Math.PI * 2)
    ctx.fillStyle = '#ffcc66'
    ctx.fill()

    ctx.restore()
  }

  // ── 11. Bagua (Eight Trigrams) symbol overlay ──────────────────────
  const baguaCx = frameX + frameW / 2
  const baguaCy = frameY + frameH / 2
  const baguaRadius = 30
  const baguaRotation = time * 0.3
  const sliceCount = 8
  const sliceAngle = (Math.PI * 2) / sliceCount

  ctx.save()

  for (let i = 0; i < sliceCount; i++) {
    const startAngle = baguaRotation + i * sliceAngle
    const endAngle = startAngle + sliceAngle

    ctx.beginPath()
    ctx.moveTo(baguaCx, baguaCy)
    ctx.arc(baguaCx, baguaCy, baguaRadius, startAngle, endAngle)
    ctx.closePath()

    // Alternating yang / yin
    if (i % 2 === 0) {
      ctx.fillStyle = '#ffd700'
    } else {
      ctx.fillStyle = '#1a1a2e'
    }
    ctx.globalAlpha = 0.4
    ctx.fill()
  }

  ctx.restore()

  // ── 12. Status text – Chinese calligraphy ──────────────────────────
  ctx.save()
  ctx.font = '14px STKaiti, KaiTi, serif'
  ctx.fillStyle = '#ffd700'
  ctx.shadowColor = '#ff8800'
  ctx.shadowBlur = 8
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('掌纹拓印', destWidth / 2, destHeight - 12)
  ctx.restore()
}
