/**
 * useGPUEffects — GPU 特效管线 Hook
 *
 * 管理整个 GPU 特效管线的生命周期：
 *   FluidSolver → LICFlowRenderer
 *   ReactionDiffusion (图灵斑纹)
 *   NBodyField (灵气星云)
 *   EffectCompositor (三元合成)
 *
 * 输入：体态关键点 + metrics
 * 输出：全屏 WebGL canvas 上的合成气场特效
 */
import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { FluidSolver } from '@/rendering/FluidSolver'
import { spineToFlowSources } from '@/rendering/EnergyFlowField'
import type { SpineFlowInput } from '@/rendering/EnergyFlowField'
import { ReactionDiffusion } from '@/rendering/ReactionDiffusion'
import type { RDSeed } from '@/rendering/ReactionDiffusion'
import { NBodyField } from '@/rendering/NBodyField'
import type { NBodySource } from '@/rendering/NBodyField'
import { LICFlowRenderer } from '@/rendering/LICFlowRenderer'
import { EffectCompositor } from '@/rendering/EffectCompositor'
import type { PostureMetrics, Keypoint } from '@/types'
import { usePostureStore } from '@/stores/postureStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useUIStore } from '@/stores/uiStore'

// ── 特效开关 ──
export interface GPUEffectsConfig {
  /** 流体模拟开关 */
  fluidEnabled: boolean
  /** RD 斑纹强度乘数 (0 关闭, 1 全开) */
  rdIntensity: number
  /** NBody 星云强度乘数 */
  nBodyIntensity: number
  /** LIC 流线强度乘数 */
  licIntensity: number
  /** 整体透明度 */
  globalAlpha: number
}

const DEFAULT_CONFIG: GPUEffectsConfig = {
  fluidEnabled: true,
  rdIntensity: 1,
  nBodyIntensity: 1,
  licIntensity: 1,
  globalAlpha: 0.6,
}

/**
 * 从 PostureMetrics 推导体态分数 (0~100)，用于驱动 RD 预设
 */
function derivePostureScore(metrics: PostureMetrics): number {
  const neckScore = Math.max(0, 100 - Math.abs(metrics.spineAngle) * 1.5 - Math.abs(metrics.headForwardAngle) * 1.2)
  const shoulderScore = Math.max(0, 100 - Math.abs(metrics.shoulderLevelDiff) * 0.2)
  const alignmentScore = Math.max(0, 100 - Math.abs(metrics.spineAngleDeviation) * 1.5)
  return Math.round((neckScore * 0.4 + shoulderScore * 0.3 + alignmentScore * 0.3))
}

/**
 * 从关键点提取脊柱坐标
 */
function extractSpinePoints(keypoints: Keypoint[] | null): Array<{ x: number; y: number }> | null {
  if (!keypoints || keypoints.length < 25) return null
  // 脊柱关键点：左右肩(11,12)、左右髋(23,24)中间点序列
  const lm = keypoints
  const midShoulderX = ((lm[11]?.x ?? 0) + (lm[12]?.x ?? 0)) / 2
  const midShoulderY = ((lm[11]?.y ?? 0) + (lm[12]?.y ?? 0)) / 2
  const midHipX = ((lm[23]?.x ?? 0) + (lm[24]?.x ?? 0)) / 2
  const midHipY = ((lm[23]?.y ?? 0) + (lm[24]?.y ?? 0)) / 2

  return [
    { x: midShoulderX, y: midShoulderY },
    { x: midShoulderX * 0.6 + midHipX * 0.4, y: midShoulderY * 0.6 + midHipY * 0.4 },
    { x: midShoulderX * 0.35 + midHipX * 0.65, y: midShoulderY * 0.35 + midHipY * 0.65 },
    { x: midHipX, y: midHipY },
  ]
}

/**
 * GPU 特效管线 Hook
 */
export function useGPUEffects(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  config: Partial<GPUEffectsConfig> = {},
) {
  const cfg = useRef({ ...DEFAULT_CONFIG, ...config })
  const animFrameRef = useRef<number>(0)
  const mountedRef = useRef(false)

  // ── 特效实例 refs ──
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const fluidRef = useRef<FluidSolver | null>(null)
  const rdRef = useRef<ReactionDiffusion | null>(null)
  const nBodyRef = useRef<NBodyField | null>(null)
  const licRef = useRef<LICFlowRenderer | null>(null)
  const compositorRef = useRef<EffectCompositor | null>(null)

  // ── 帧率节流 ──
  const lastStepTime = useRef(0)
  const STEP_INTERVAL = 16 // ~60fps 模拟步进

  // ── 保存 stepEffects 最新引用，供动画循环使用 ──
  const stepRef = useRef<((now: number) => void) | null>(null)

  // ── 缓存上一次的种子/源用于去重 ──
  const lastSpinePoints = useRef<string>('')
  const lastScore = useRef<number>(50)

  // ── Stores（用于 UI 层响应式驱动 mode/degradation） ──
  const mode = useSessionStore((s) => s.mode)
  const degradationLevel = useUIStore((s) => s.degradationLevel)

  // ── 核心渲染步进：从 store 直接读取最新 keypoints/metrics ──
  const stepEffects = useCallback((_now: number) => {
    const fluid = fluidRef.current
    const rd = rdRef.current
    const nBody = nBodyRef.current
    const lic = licRef.current
    const compositor = compositorRef.current
    const renderer = rendererRef.current
    if (!fluid || !rd || !nBody || !lic || !compositor || !renderer) return

    const c = cfg.current
    if (!c.fluidEnabled) return

    // 从 store 直接读取最新数据（避免闭包陈旧）
    const state = usePostureStore.getState()
    const kps = state.keypoints
    const mtr = state.metrics

    // 1. 从关键点生成流体源并注入
    const spinePoints = extractSpinePoints(kps)
    if (spinePoints && mtr) {
      const scoreHash = derivePostureScore(mtr).toFixed(0) + '-' + spinePoints.map(p => p.x.toFixed(2) + p.y.toFixed(2)).join(',')
      if (scoreHash !== lastSpinePoints.current) {
        lastSpinePoints.current = scoreHash

        const score = derivePostureScore(mtr)

        // 流体源 — 沿脊柱注入速度
        const spineInput: SpineFlowInput = {
          spinePoints,
          energyLevel: Math.max(0.2, score / 100),
          energyState: score > 70 ? 'flowing' : score > 40 ? 'blocked' : 'diminished',
          lateralCurvature: Math.abs(mtr.spineAngle) * 0.1,
        }
        const flowSources = spineToFlowSources(spineInput)
        fluid.addSources(flowSources)

        // RD 预设
        if (score !== lastScore.current) {
          lastScore.current = score
          rd.autoPreset(score)
        }

        // RD 种子 — 脊柱节点
        const rdSeeds: RDSeed[] = spinePoints.map((p, i) => ({
          x: p.x,
          y: p.y,
          radius: 0.04 + i * 0.01,
          uAmount: 0.3,
          vAmount: 0.15,
        }))
        rd.addSeeds(rdSeeds)

        // NBody 源 — 脊柱节点
        const sources: NBodySource[] = []
        spinePoints.forEach((p, i) => {
          sources.push({ x: p.x, y: p.y, mass: 1.5 - i * 0.2, color: new THREE.Color().setHSL(0.6 + i * 0.1, 0.8, 0.5 + i * 0.1) })
        })
        nBody.setSources(sources)
      }
    }

    // 2. 步进模拟
    fluid.step()
    rd.step()
    nBody.step(0.016)

    // 3. LIC 从流体速度场渲染流线
    const licTex = lic.render(fluid.getVelocityTexture())

    // 4. 三元合成 → 屏幕
    compositor.setStrength(
      0.35 * c.rdIntensity,
      0.5 * c.nBodyIntensity,
      0.3 * c.licIntensity,
    )
    compositor.compositeTo(
      rd.getVisualizationTexture(),
      nBody.getRenderTexture(),
      licTex,
      null, // 直接渲染到屏幕
    )
  }, [])

  // ── 保持 stepEffects 最新引用（动画循环用的是 ref） ──
  stepRef.current = stepEffects

  // ── Mount / Unmount ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 初始化 Three.js 渲染器（透明 canvas 叠加层）
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setClearColor(0x000000, 0)
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    rendererRef.current = renderer

    // 初始化特效模块
    const fluid = new FluidSolver(renderer, { resolution: 256 })
    fluidRef.current = fluid

    const rd = new ReactionDiffusion(renderer, { resolution: 256 })
    rdRef.current = rd

    const nBody = new NBodyField(renderer, { particleCount: 1024 })
    nBodyRef.current = nBody

    const lic = new LICFlowRenderer(renderer, { resolution: 256 })
    licRef.current = lic

    const compositor = new EffectCompositor(renderer, { resolution: 256 })
    compositorRef.current = compositor

    mountedRef.current = true

    // 启动渲染循环（stepRef.current 始终指向最新 stepEffects）
    const loop = (now: number) => {
      if (!mountedRef.current) return
      animFrameRef.current = requestAnimationFrame(loop)

      if (now - lastStepTime.current < STEP_INTERVAL) return
      lastStepTime.current = now

      try {
        stepRef.current?.(now)
      } catch (_) {
        // 静默降级
      }
    }
    animFrameRef.current = requestAnimationFrame(loop)

    return () => {
      mountedRef.current = false
      cancelAnimationFrame(animFrameRef.current)
      disposeAll()
    }
  }, [canvasRef])

  // ── 模式切换 → RD 预设 ──
  useEffect(() => {
    const rd = rdRef.current
    if (!rd) return
    if (mode === 'meditation') rd.setPreset('coral')
    else if (mode === 'casual') rd.setPreset('cells')
    else rd.setPreset('stripes')
  }, [mode])

  // ── 资源释放 ──
  const disposeAll = useCallback(() => {
    fluidRef.current?.dispose()
    rdRef.current?.dispose()
    nBodyRef.current?.dispose()
    licRef.current?.dispose()
    compositorRef.current?.dispose()
    rendererRef.current?.dispose()
    fluidRef.current = null
    rdRef.current = null
    nBodyRef.current = null
    licRef.current = null
    compositorRef.current = null
    rendererRef.current = null
  }, [])

  // ── 降级：关闭特效 ──
  useEffect(() => {
    if (degradationLevel === 'level3') {
      cfg.current.globalAlpha = 0
    } else if (degradationLevel === 'level2') {
      cfg.current.globalAlpha = 0.3
      cfg.current.licIntensity = 0.3
    } else if (degradationLevel === 'level1') {
      cfg.current.globalAlpha = 0.5
    } else {
      cfg.current.globalAlpha = DEFAULT_CONFIG.globalAlpha
    }
  }, [degradationLevel])

  return {
    /** 更新开关配置 */
    setConfig: (update: Partial<GPUEffectsConfig>) => {
      Object.assign(cfg.current, update)
    },
    /** 手动触发一帧 */
    step: () => stepEffects(performance.now()),
  }
}
