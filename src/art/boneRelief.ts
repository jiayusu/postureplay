/**
 * Canvas 2D Rutt/Etra-style facial bone wireframe sculpture renderer
 *
 * Inspired by C-Trend Live (yufengzhao.com).
 * Transforms the face into a wireframe relief where facial features create
 * peaks and valleys — as if X-ray bone structure is exposed through
 * multi-layer wireframe rendering.
 *
 * Builds on the core wireframeRelief.ts renderer, adding:
 *   - Face-outline-aware cropping
 *   - Sobel edge enhancement for sharper facial contours
 *   - Multi-layer rendering: marble base, bone structure, anatomical detail
 *   - Forehead sunrise glow (foreheadFullness)
 *   - Diamond cheekbone prominence markers
 *   - Golden face outline overlay
 *   - Chinese face-shape status label
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
// Types
// ──────────────────────────────────────────────

/** Bone analysis metrics from face-reading pipeline */
export interface BoneMetrics {
  overallScore: number
  foreheadFullness: number
  cheekboneProminence: number
  jawAngle: number
  faceShape: string
}

/** Normalized face landmark point */
export interface FacePoint {
  x: number
  y: number
}

// ──────────────────────────────────────────────
// Face shape label map
// ──────────────────────────────────────────────

const FACE_SHAPE_LABELS: Record<string, string> = {
  round:    '\u5706\u6DA6\u00B7\u798F\u76F8',   // 圆润·福相
  square:   '\u65B9\u6B63\u00B7\u6BC5\u529B',   // 方正·毅力
  oval:     '\u9E45\u86CB\u00B7\u6E05\u79C0',   // 鹅蛋·清秀
  diamond:  '\u83F1\u5F62\u00B7\u7075\u52A8',    // 菱形·灵动
  triangle: '\u4E09\u89D2\u00B7\u654F\u9510',    // 三角·敏锐
}

// ──────────────────────────────────────────────
// Sobel edge detection
// ──────────────────────────────────────────────

/**
 * Apply a simple Sobel edge detection to the given ImageData.
 * Returns a new ImageData where edge pixels are white and non-edges are black.
 * This sharpens facial contours before passing into the wireframe renderer.
 */
function sobelEdgeDetect(imageData: ImageData): ImageData {
  const { data, width, height } = imageData
  const output = new ImageData(width, height)

  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1]

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0
      let gy = 0
      let k = 0

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4
          // Use grayscale of the pixel
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
          gx += gray * sobelX[k]
          gy += gray * sobelY[k]
          k++
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy)
      const val = Math.min(255, magnitude)

      const outIdx = (y * width + x) * 4
      output.data[outIdx] = val
      output.data[outIdx + 1] = val
      output.data[outIdx + 2] = val
      output.data[outIdx + 3] = 255
    }
  }

  return output
}

// ──────────────────────────────────────────────
// renderBoneRelief
// ──────────────────────────────────────────────

/**
 * Render a facial bone wireframe sculpture.
 *
 * @param ctx          Target canvas 2D context
 * @param video        Source video element (face / portrait feed)
 * @param offscreen    Reusable offscreen canvas for ImageData extraction
 * @param destWidth    Target canvas pixel width
 * @param destHeight   Target canvas pixel height
 * @param faceOutline  Normalized 0-1 face contour points (nullable)
 * @param boneMetrics  Bone analysis metrics (nullable)
 * @param time         Monotonic time in seconds
 */
export function renderBoneRelief(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  offscreen: HTMLCanvasElement,
  destWidth: number,
  destHeight: number,
  faceOutline: FacePoint[] | null,
  boneMetrics: BoneMetrics | null,
  _time: number,
): void {
  // ── 0. Compute crop bounding box from face outline ──
  let crop: { x: number; y: number; w: number; h: number }

  if (faceOutline && faceOutline.length >= 5) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0
    for (const pt of faceOutline) {
      if (pt.x < minX) minX = pt.x
      if (pt.y < minY) minY = pt.y
      if (pt.x > maxX) maxX = pt.x
      if (pt.y > maxY) maxY = pt.y
    }
    const paddingX = (maxX - minX) * 0.05
    const paddingY = (maxY - minY) * 0.05
    crop = {
      x: Math.max(0, minX - paddingX),
      y: Math.max(0, minY - paddingY),
      w: Math.min(1 - (minX - paddingX), (maxX - minX) + paddingX * 2),
      h: Math.min(1 - (minY - paddingY), (maxY - minY) + paddingY * 2),
    }
  } else {
    crop = { x: 0.25, y: 0.05, w: 0.5, h: 0.55 }
  }

  // ── 1. Acquire image data through the crop region ──
  const imgInfo = getVideoImageData(video, offscreen, crop)
  if (!imgInfo) return

  const { data: rawImageData, width: srcWidth, height: srcHeight } = imgInfo

  // ── 2. Clear canvas ──
  ctx.clearRect(0, 0, destWidth, destHeight)

  // ── 3. Sobel edge enhancement ──
  const edgeImageData = sobelEdgeDetect(rawImageData)

  // ── 4. Relief params ──
  const cheekProm = boneMetrics?.cheekboneProminence ?? 0.5

  const reliefParams: ReliefParams = {
    sampleGapX: 4,
    sampleGapY: 2,
    amplitude: (55 + cheekProm * 30) * 1.4,
    baseYOffset: destHeight * 0.7,
    crop: { x: 0, y: 0, w: 1, h: 1 }, // image is already cropped
  }

  // ── 5. Layer helper ──
  function makeLayer(
    color: string,
    lineWidth: number,
    globalAlpha: number,
    glow: number,
    displacementScale: number,
  ): WireframeLayer {
    return {
      color,
      lineWidth,
      globalAlpha,
      glow,
      glowColor: color,
      offsetX: 0,
      offsetY: 0,
      horizontalOnly: false,
      displacementScale,
    }
  }

  // ── Layer 1: Marble base ═══════════════════
  const layer1: WireframeLayer = makeLayer('#8b7355', 7, 0.35, 20, 1.0)
  const opts1: WireframeReliefOptions = {
    params: reliefParams,
    layers: [layer1],
    connectHorizontal: true,
    connectVertical: true,
    verticalConnectGap: 6,
  }
  renderWireframeRelief(
    ctx, edgeImageData, srcWidth, srcHeight,
    destWidth, destHeight, opts1,
  )

  // ── Layer 2: Bone structure ════════════════
  const layer2: WireframeLayer = makeLayer('#d4a560', 3, 0.6, 12, 1.0)
  const opts2: WireframeReliefOptions = {
    params: reliefParams,
    layers: [layer2],
    connectHorizontal: true,
    connectVertical: true,
    verticalConnectGap: 3,
  }
  renderWireframeRelief(
    ctx, edgeImageData, srcWidth, srcHeight,
    destWidth, destHeight, opts2,
  )

  // ── Layer 3: Anatomical detail ═════════════
  const layer3: WireframeLayer = makeLayer('#e8d5a0', 1.2, 0.8, 0, 1.0)
  const opts3: WireframeReliefOptions = {
    params: reliefParams,
    layers: [layer3],
    connectHorizontal: true,
    connectVertical: false,
    verticalConnectGap: 1,
  }
  renderWireframeRelief(
    ctx, edgeImageData, srcWidth, srcHeight,
    destWidth, destHeight, opts3,
  )

  // ── 6. Forehead sunrise ──
  const foreheadFullness = boneMetrics?.foreheadFullness ?? 0
  if (foreheadFullness > 0.5) {
    const sunCenterX = destWidth / 2
    const sunCenterY = destHeight * 0.15
    const sunRadius = foreheadFullness * 50

    ctx.save()
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'

    for (let i = 0; i < 5; i++) {
      const alpha = 0.5 - i * 0.08
      if (alpha <= 0) continue
      const startAngle = -Math.PI * 0.6 + i * 0.3
      const sweepAngle = 0.25

      ctx.globalAlpha = alpha
      ctx.strokeStyle = '#ff8800'
      ctx.shadowColor = '#ff6600'
      ctx.shadowBlur = 8

      ctx.beginPath()
      ctx.arc(sunCenterX, sunCenterY, sunRadius - i * 4, startAngle, startAngle + sweepAngle)
      ctx.stroke()
    }

    ctx.restore()
  }

  // ── 7. Cheekbone prominence markers ──
  const cheekboneProminence = boneMetrics?.cheekboneProminence ?? 0
  if (cheekboneProminence > 0.5) {
    const leftX = destWidth * 0.25
    const rightX = destWidth * 0.75
    const cheekY = destHeight * 0.4
    const diamondSize = 6 + cheekboneProminence * 8

    ctx.save()
    ctx.strokeStyle = '#ffaa44'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.shadowColor = '#ffaa44'
    ctx.shadowBlur = 10

    drawDiamond(ctx, leftX, cheekY, diamondSize)
    drawDiamond(ctx, rightX, cheekY, diamondSize)

    // Inner fill glow
    ctx.fillStyle = 'rgba(255,170,68,0.2)'
    fillDiamond(ctx, leftX, cheekY, diamondSize * 0.5)
    fillDiamond(ctx, rightX, cheekY, diamondSize * 0.5)

    ctx.restore()
  }

  // ── 8. Face outline overlay ──
  if (faceOutline && faceOutline.length >= 5) {
    const points = faceOutline.map(pt => ({
      x: ((pt.x - crop.x) / crop.w) * destWidth,
      y: ((pt.y - crop.y) / crop.h) * destHeight,
    }))

    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // Draw 3 passes with decreasing opacity and increasing lineWidth for glow
    const passes: Array<{ alpha: number; lineWidth: number }> = [
      { alpha: 0.6, lineWidth: 2 },
      { alpha: 0.3, lineWidth: 4 },
      { alpha: 0.1, lineWidth: 6 },
    ]

    for (const pass of passes) {
      ctx.globalAlpha = pass.alpha
      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = pass.lineWidth
      ctx.shadowColor = '#ff8800'
      ctx.shadowBlur = 12

      drawClosedPath(ctx, points)
    }

    ctx.restore()
  }

  // ── 9. Face shape status label ──
  const faceShape = boneMetrics?.faceShape ?? 'round'
  const label = FACE_SHAPE_LABELS[faceShape] ?? FACE_SHAPE_LABELS['round']

  ctx.save()
  ctx.font = '13px STKaiti, KaiTi, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.shadowColor = '#aa8855'
  ctx.shadowBlur = 6
  ctx.fillStyle = '#d4a560'
  ctx.fillText(label, destWidth / 2, 8)
  ctx.restore()
}

// ──────────────────────────────────────────────
// Drawing helpers
// ──────────────────────────────────────────────

/** Draw a diamond shape at (cx, cy) with given radius */
function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)       // top
  ctx.lineTo(cx + r, cy)       // right
  ctx.lineTo(cx, cy + r)       // bottom
  ctx.lineTo(cx - r, cy)       // left
  ctx.closePath()
  ctx.stroke()
}

/** Fill a diamond shape at (cx, cy) with given radius */
function fillDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r, cy)
  ctx.lineTo(cx, cy + r)
  ctx.lineTo(cx - r, cy)
  ctx.closePath()
  ctx.fill()
}

/** Stroke a closed path through the given point array */
function drawClosedPath(
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
  ctx.stroke()
}
