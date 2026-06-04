/**
 * useGPUEffects — GPU 特效管线 Hook (v2)
 *
 * 管理完整 GPU 特效管线的生命周期：
 *   FluidSolver → LICFlowRenderer          (流体 + 流线)
 *   ReactionDiffusion                       (图灵斑纹)
 *   NBodyField                              (灵气星云)
 *   GPUParticleAdvection                    (粒子烟雾平流)
 *   MeridianForceLines                      (经络力场线)
 *   ChakraOrbs                              (七脉轮辉光)
 *   MultiLayerCompositor                    (全层合成 + 呼吸扭曲)
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
import { NBodyField } from '@/rendering/NBodyField'
import type { NBodySource } from '@/rendering/NBodyField'
import { LICFlowRenderer } from '@/rendering/LICFlowRenderer'
import { GPUParticleAdvection } from '@/rendering/GPUParticleAdvection'
import { MeridianForceLines } from '@/rendering/MeridianForceLines'
import { ChakraOrbs } from '@/rendering/ChakraOrbs'
import { MultiLayerCompositor } from '@/rendering/MultiLayerCompositor'
import type { PostureMetrics, Keypoint } from '@/types'
import { usePostureStore } from '@/stores/postureStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useUIStore } from '@/stores/uiStore'

// ── 特效开关 ──
export interface GPUEffectsConfig {
  fluidEnabled: boolean
  rdIntensity: number
  nBodyIntensity: number
  licIntensity: number
  particleIntensity: number
  meridianIntensity: number
  chakraIntensity: number
  globalAlpha: number
}

const DEFAULT_CONFIG: GPUEffectsConfig = {
  fluidEnabled: true,
  rdIntensity: 1,
  nBodyIntensity: 1,
  licIntensity: 1,
  particleIntensity: 1,
  meridianIntensity: 1,
  chakraIntensity: 1,
  globalAlpha: 0.6,
}

/** 推导体态分数 0~100 */
function derivePostureScore(metrics: PostureMetrics): number {
  const neckScore = Math.max(0, 100 - Math.abs(metrics.spineAngle) * 1.5 - Math.abs(metrics.headForwardAngle) * 1.2)
  const shoulderScore = Math.max(0, 100 - Math.abs(metrics.shoulderLevelDiff) * 0.2)
  const alignmentScore = Math.max(0, 100 - Math.abs(metrics.spineAngleDeviation) * 1.5)
  return Math.round((neckScore * 0.4 + shoulderScore * 0.3 + alignmentScore * 0.3))
}

/** 从关键点提取脊柱坐标 */
function extractSpinePoints(keypoints: Keypoint[] | null): Array<{ x: number; y: number }> | null {
  if (!keypoints || keypoints.length < 25) return null
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

/** 从关键点提取所有关键关节 (12 点) */
function extractJointKeypoints(kps: Keypoint[] | null): Array<{ x: number; y: number }> {
  if (!kps || kps.length < 29) return []
  const indices = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
  return indices
    .map(i => kps[i] ? { x: kps[i].x, y: kps[i].y } : null)
    .filter(Boolean) as Array<{ x: number; y: number }>
}

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
  const particlesRef = useRef<GPUParticleAdvection | null>(null)
  const meridianRef = useRef<MeridianForceLines | null>(null)
  const chakraRef = useRef<ChakraOrbs | null>(null)
  const compositorRef = useRef<MultiLayerCompositor | null>(null)

  // 额外 RT（粒子/脉轮渲染到纹理）
  const particlesRTRef = useRef<THREE.WebGLRenderTarget | null>(null)
  const chakraRTRef = useRef<THREE.WebGLRenderTarget | null>(null)

  // 帧率节流
  const lastStepTime = useRef(0)
  const STEP_INTERVAL = 16
  const stepRef = useRef<((now: number) => void) | null>(null)
  const lastSpinePoints = useRef<string>('')
  const lastScore = useRef<number>(50)

  // Stores
  const mode = useSessionStore((s) => s.mode)
  const degradationLevel = useUIStore((s) => s.degradationLevel)

  // ── 核心渲染步进 ──
  const stepEffects = useCallback((_now: number) => {
    const fluid = fluidRef.current
    const rd = rdRef.current
    const nBody = nBodyRef.current
    const lic = licRef.current
    const particles = particlesRef.current
    const meridian = meridianRef.current
    const chakra = chakraRef.current
    const compositor = compositorRef.current
    const renderer = rendererRef.current
    const particlesRT = particlesRTRef.current
    const chakraRT = chakraRTRef.current
    if (!fluid || !rd || !nBody || !lic || !particles || !meridian || !chakra || !compositor || !renderer) return
    if (!particlesRT || !chakraRT) return

    const c = cfg.current
    if (!c.fluidEnabled) return

    const dt = 0.016

    // 从 store 直接读取最新数据
    const state = usePostureStore.getState()
    const kps = state.keypoints
    const mtr = state.metrics

    // 1. 从关键点生成流体源并注入
    const spinePoints = extractSpinePoints(kps)
    if (spinePoints && mtr) {
      const scoreHash = derivePostureScore(mtr).toFixed(0) + '-' +
        spinePoints.map(p => p.x.toFixed(2) + p.y.toFixed(2)).join(',')
      if (scoreHash !== lastSpinePoints.current) {
        lastSpinePoints.current = scoreHash
        const score = derivePostureScore(mtr)
        if (score !== lastScore.current) {
          lastScore.current = score
          rd.autoPreset(score)
        }

        // 流体源
        const spineInput: SpineFlowInput = {
          spinePoints,
          energyLevel: Math.max(0.2, score / 100),
          energyState: score > 70 ? 'flowing' : score > 40 ? 'blocked' : 'diminished',
          lateralCurvature: Math.abs(mtr.spineAngle) * 0.1,
        }
        fluid.addSources(spineToFlowSources(spineInput))

        // RD 种子
        rd.addSeeds(spinePoints.map((p, i) => ({
          x: p.x, y: p.y, radius: 0.04 + i * 0.01, uAmount: 0.3, vAmount: 0.15,
        })))

        // NBody 源
        const sources: NBodySource[] = spinePoints.map((p, i) => ({
          x: p.x, y: p.y, mass: 1.5 - i * 0.2,
          color: new THREE.Color().setHSL(0.6 + i * 0.1, 0.8, 0.5 + i * 0.1),
        }))
        nBody.setSources(sources)
      }
    }

    // 经络力场线：每帧更新关键点
    if (kps) {
      const joints = extractJointKeypoints(kps)
      if (joints.length > 0) {
        const score = mtr ? derivePostureScore(mtr) : 50
        meridian.setKeypoints(joints, score)
        meridian.setColorByScore(score)
      }
    }

    // 脉轮位置
    if (spinePoints && mtr) {
      const score = derivePostureScore(mtr)
      const centerX = spinePoints[1]?.x ?? 0.5
      chakra.updatePositions(centerX, 0.7 * c.chakraIntensity, score)
    }
    chakra.update(dt)

    // 呼吸扭曲中心跟随脊柱
    if (spinePoints) {
      const cx = spinePoints[0]?.x ?? 0.5
      const cy = spinePoints[0]?.y ?? 0.5
      compositor.setBreathCenter(cx, cy)
    }
    compositor.setBreath(dt, 12, 1)

    // 2. 步进模拟
    fluid.step()
    rd.step()
    nBody.step(dt)

    // 3. 粒子平流
    particles.step(dt, fluid.getVelocityTexture())
    // 渲染粒子到 RT
    particles.renderToRT(particlesRT)

    // 4. 经络力场线
    const meridianTex = meridian.render()

    // 5. LIC 流线
    const licTex = lic.render(fluid.getVelocityTexture())

    // 6. 脉轮到 RT
    chakra.renderToRT(chakraRT)

    // 7. 全层合成 → 复合 → 呼吸扭曲 → 屏幕
    compositor.setLayers({
      rdStrength: 0.35 * c.rdIntensity,
      nBodyStrength: 0.5 * c.nBodyIntensity,
      licStrength: 0.3 * c.licIntensity,
      particleStrength: 0.4 * c.particleIntensity,
      meridianStrength: 0.35 * c.meridianIntensity,
      chakraStrength: 0.6 * c.chakraIntensity,
    })
    compositor.compositeFinal({
      rd: rd.getVisualizationTexture(),
      nBody: nBody.getRenderTexture(),
      lic: licTex,
      particles: particlesRT.texture,
      meridian: meridianTex,
      chakra: chakraRT.texture,
      dt,
    })
  }, [])

  stepRef.current = stepEffects

  // ── Mount / Unmount ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false, antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setClearColor(0x000000, 0)
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    // 立即清除画布，避免显示黑色背景
    renderer.clear()
    rendererRef.current = renderer

    // 公共 RT 选项 (256px 足够特效使用)
    const rtHalf: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.FloatType,
    }

    particlesRTRef.current = new THREE.WebGLRenderTarget(256, 256, rtHalf)
    chakraRTRef.current = new THREE.WebGLRenderTarget(256, 256, rtHalf)

    // 初始化各模块
    fluidRef.current = new FluidSolver(renderer, { resolution: 256 })
    rdRef.current = new ReactionDiffusion(renderer, { resolution: 256 })
    nBodyRef.current = new NBodyField(renderer, { particleCount: 1024 })
    licRef.current = new LICFlowRenderer(renderer, { resolution: 256 })
    particlesRef.current = new GPUParticleAdvection(renderer, { particleCount: 2048 })
    meridianRef.current = new MeridianForceLines(renderer, { resolution: 256 })
    chakraRef.current = new ChakraOrbs(renderer, {})
    compositorRef.current = new MultiLayerCompositor(renderer, 256)

    mountedRef.current = true

    const loop = (now: number) => {
      if (!mountedRef.current) return
      animFrameRef.current = requestAnimationFrame(loop)
      if (now - lastStepTime.current < STEP_INTERVAL) return
      lastStepTime.current = now
      try { stepRef.current?.(now) } catch (_) { /* 静默降级 */ }
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
    particlesRef.current?.dispose()
    meridianRef.current?.dispose()
    chakraRef.current?.dispose()
    compositorRef.current?.dispose()
    particlesRTRef.current?.dispose()
    chakraRTRef.current?.dispose()
    rendererRef.current?.dispose()
    fluidRef.current = null; rdRef.current = null; nBodyRef.current = null
    licRef.current = null; particlesRef.current = null
    meridianRef.current = null; chakraRef.current = null
    compositorRef.current = null; rendererRef.current = null
    particlesRTRef.current = null; chakraRTRef.current = null
  }, [])

  // ── 降级 ──
  useEffect(() => {
    if (degradationLevel === 'level3') {
      cfg.current.globalAlpha = 0
    } else if (degradationLevel === 'level2') {
      cfg.current.globalAlpha = 0.25
      cfg.current.licIntensity = 0.3
      cfg.current.particleIntensity = 0.3
      cfg.current.meridianIntensity = 0.3
      cfg.current.chakraIntensity = 0.3
    } else if (degradationLevel === 'level1') {
      cfg.current.globalAlpha = 0.5
      cfg.current.particleIntensity = 0.6
      cfg.current.meridianIntensity = 0.6
    } else {
      cfg.current.globalAlpha = DEFAULT_CONFIG.globalAlpha
    }
  }, [degradationLevel])

  return {
    setConfig: (update: Partial<GPUEffectsConfig>) => {
      Object.assign(cfg.current, update)
    },
    step: () => stepEffects(performance.now()),
  }
}
