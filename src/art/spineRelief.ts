/**
 * Spine Wireframe Relief Renderer
 *
 * Rutt/Etra-style spine wireframe relief for posture visualization.
 * Inspired by C-Trend Live (yufengzhao.com).
 *
 * Renders a multi-layer wireframe relief from video, overlaid with a spine
 * highlight line, energy-state pulse, and status label — tuned for body/posture
 * feedback.
 */

import {
  renderWireframeRelief,
  getVideoImageData,
} from './wireframeRelief'

import type {
  WireframeReliefOptions,
  ReliefParams,
  WireframeLayer,
} from './wireframeRelief'

// ──────────────────────────────────────────────
// Energy state helpers
// ──────────────────────────────────────────────

type EnergyState = 'flowing' | 'blocked' | 'diminished'

interface SpineEnergy {
  state: EnergyState
}

interface SpineMetrics {
  overallScore: number
  lateralCurvature: number
}

/** Color palette keyed by energy state */
const ENERGY_COLORS: Record<
  EnergyState,
  { layer1: string; layer2: string; layer3: string }
> = {
  flowing:   { layer1: '#ff8c00', layer2: '#ffb833', layer3: '#ffd700' },
  blocked:   { layer1: '#444466', layer2: '#667788', layer3: '#8899aa' },
  diminished:{ layer1: '#334466', layer2: '#556688', layer3: '#7788cc' },
}

const SPINE_HIGHLIGHT: Record<
  EnergyState,
  { color: string; glow: number; lineWidth: number }
> = {
  flowing:    { color: '#ffffff', glow: 30, lineWidth: 3 },
  blocked:    { color: '#aaaaaa', glow: 5,  lineWidth: 3 },
  diminished: { color: '#8888bb', glow: 5,  lineWidth: 3 },
}

const PULSE_COLOR: Record<EnergyState, string> = {
  flowing:    'rgba(255,180,50,0.08)',
  blocked:    'rgba(100,100,150,0.04)',
  diminished: 'rgba(80,80,180,0.03)',
}

const ENERGY_LABEL: Record<EnergyState, string> = {
  flowing:    '流动',
  blocked:    '堵塞',
  diminished: '衰退',
}

// ──────────────────────────────────────────────
// renderSpineRelief
// ──────────────────────────────────────────────

/**
 * Render a spine-focused wireframe relief overlay.
 *
 * @param ctx          Target canvas 2D context
 * @param video        Source video element (posture / body feed)
 * @param offscreen    Reusable offscreen canvas for ImageData extraction
 * @param destWidth    Target canvas pixel width
 * @param destHeight   Target canvas pixel height
 * @param spineMetrics Current spine posture metrics (nullable)
 * @param spineEnergy  Energy flow state (nullable)
 * @param time         Monotonic time in seconds (for pulse animation)
 */
export function renderSpineRelief(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  offscreen: HTMLCanvasElement,
  destWidth: number,
  destHeight: number,
  spineMetrics: SpineMetrics | null,
  spineEnergy: SpineEnergy | null,
  time: number,
): void {
  // ── 0. Acquire image data ──
  const cropRect = { x: 0.15, y: 0.05, w: 0.7, h: 0.9 }
  const imgInfo = getVideoImageData(video, offscreen, cropRect)
  if (!imgInfo) return

  const { data: imageData, width: srcWidth, height: srcHeight } = imgInfo

  // ── Clear canvas ──
  ctx.clearRect(0, 0, destWidth, destHeight)

  // ── Determine energy state ──
  const state: EnergyState = spineEnergy?.state ?? 'flowing'
  const colors = ENERGY_COLORS[state]

  // ── Relief params ──
  const amplitude = spineMetrics
    ? 70 + spineMetrics.overallScore * 0.3
    : 80

  const reliefParams: ReliefParams = {
    sampleGapX: 4,
    sampleGapY: 2,
    amplitude: amplitude * 1.4,
    baseYOffset: destHeight * 0.85,
    crop: cropRect,
  }

  // ── Build layer helper ──
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

  // ── Layer 1: Deep glow ──
  const layer1: WireframeLayer = makeLayer(colors.layer1, 8, 0.45, 30, 1.0)
  const opts1: WireframeReliefOptions = {
    params: reliefParams,
    layers: [layer1],
    connectHorizontal: true,
    connectVertical: true,
    verticalConnectGap: 6,
  }
  renderWireframeRelief(ctx, imageData, srcWidth, srcHeight, destWidth, destHeight, opts1)

  // ── Layer 2: Mid structure ──
  const layer2: WireframeLayer = makeLayer(colors.layer2, 3, 0.75, 14, 1.0)
  const opts2: WireframeReliefOptions = {
    params: reliefParams,
    layers: [layer2],
    connectHorizontal: true,
    connectVertical: true,
    verticalConnectGap: 3,
  }
  renderWireframeRelief(ctx, imageData, srcWidth, srcHeight, destWidth, destHeight, opts2)

  // ── Layer 3: Fine detail ──
  const layer3: WireframeLayer = makeLayer(colors.layer3, 1.5, 0.9, 0, 1.0)
  const opts3: WireframeReliefOptions = {
    params: reliefParams,
    layers: [layer3],
    connectHorizontal: true,
    connectVertical: false,
    verticalConnectGap: 1,
  }
  renderWireframeRelief(ctx, imageData, srcWidth, srcHeight, destWidth, destHeight, opts3)

  // ── Layer 4: Spine highlight (single bright column at center) ──
  const centerX = Math.floor(destWidth / 2)
  const topY = destHeight * 0.05
  const bottomY = destHeight * 0.9
  const spine = SPINE_HIGHLIGHT[state]

  ctx.save()
  ctx.shadowColor = spine.color
  ctx.shadowBlur = spine.glow
  ctx.strokeStyle = spine.color
  ctx.lineWidth = spine.lineWidth
  ctx.beginPath()
  ctx.moveTo(centerX, topY)
  ctx.lineTo(centerX, bottomY)
  ctx.stroke()
  ctx.restore()

  // ── Time-based pulse effect ──
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = PULSE_COLOR[state]
  ctx.beginPath()
  const pulseRadius = 40 + Math.sin(time * 2) * 20
  ctx.arc(centerX, destHeight * 0.5, pulseRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // ── Status label (bottom-right) ──
  const label = ENERGY_LABEL[state]
  const labelColor = colors.layer3
  const fontSize = 12
  const padding = 8

  ctx.save()
  ctx.font = `${fontSize}px sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.shadowColor = labelColor
  ctx.shadowBlur = 6
  ctx.fillStyle = labelColor
  ctx.fillText(label, destWidth - padding, destHeight - padding)
  ctx.restore()
}
