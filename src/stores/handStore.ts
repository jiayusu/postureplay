// ============================================================
// 体态游乐场 PosturePlay — handStore
//
// 管理手部健康数据：检测结果、手部健康指标、
// 模型加载状态、综合双手评估。
// ============================================================

import { create } from 'zustand'
import type {
  HandHealthMetrics,
  CombinedHandMetrics,
} from '@/types/hand'
import { getHandHealthService } from '@/services/hand'
import type { DetectedHand } from '@/services/hand'

interface HandState {
  /** 最新检测到的手部列表 */
  detectedHands: DetectedHand[]
  /** 左手健康指标 */
  leftHandMetrics: HandHealthMetrics | null
  /** 右手健康指标 */
  rightHandMetrics: HandHealthMetrics | null
  /** 双手综合指标 */
  combinedMetrics: CombinedHandMetrics | null
  /** 手部模型加载状态 */
  handModelStatus: 'idle' | 'loading' | 'ready' | 'error'
  /** 手部模型加载进度 */
  handModelProgress: number // 0-100
  /** 当前使用的 Canvas 引用（用于颜色/掌纹分析） */
  analysisCanvas: HTMLCanvasElement | null

  // Actions
  loadHandModel(): Promise<void>
  setAnalysisCanvas(canvas: HTMLCanvasElement | null): void
  updateDetectedHands(hands: DetectedHand[]): void
  computeHandMetrics(): void
  computeCombinedMetrics(): void
  resetHandState(): void
}

export const useHandStore = create<HandState>((set, get) => ({
  // ── State ──
  detectedHands: [],
  leftHandMetrics: null,
  rightHandMetrics: null,
  combinedMetrics: null,
  handModelStatus: 'idle',
  handModelProgress: 0,
  analysisCanvas: null,

  // ── Actions ──

  loadHandModel: async () => {
    const svc = getHandHealthService()
    set({ handModelStatus: 'loading', handModelProgress: 0 })

    try {
      await svc.initialize((pct) => {
        set({ handModelProgress: pct })
      })
      set({ handModelStatus: 'ready' })
    } catch (err) {
      console.error('[handStore] 手部模型加载失败:', err)
      set({ handModelStatus: 'error' })
    }
  },

  setAnalysisCanvas: (canvas) => {
    set({ analysisCanvas: canvas })
  },

  updateDetectedHands: (hands) => {
    set({ detectedHands: hands })
  },

  computeHandMetrics: () => {
    const svc = getHandHealthService()
    const { detectedHands, analysisCanvas } = get()

    // 分类左右手
    const leftHand = detectedHands.find((h) => h.handedness === 'Left')
    const rightHand = detectedHands.find((h) => h.handedness === 'Right')

    let leftMetrics: HandHealthMetrics | null = null
    let rightMetrics: HandHealthMetrics | null = null

    if (leftHand && leftHand.confidence > 0.5) {
      // 使用 Canvas 进行颜色和掌纹分析
      const canvas = analysisCanvas
      leftMetrics = svc.computeHandMetrics(leftHand, canvas)
    }

    if (rightHand && rightHand.confidence > 0.5) {
      const canvas = analysisCanvas
      rightMetrics = svc.computeHandMetrics(rightHand, canvas)
    }

    set({
      leftHandMetrics: leftMetrics,
      rightHandMetrics: rightMetrics,
    })
  },

  computeCombinedMetrics: () => {
    const svc = getHandHealthService()
    const { leftHandMetrics, rightHandMetrics } = get()

    const combined = svc.computeCombinedMetrics(leftHandMetrics, rightHandMetrics)
    set({ combinedMetrics: combined })
  },

  resetHandState: () => {
    set({
      detectedHands: [],
      leftHandMetrics: null,
      rightHandMetrics: null,
      combinedMetrics: null,
    })
  },
}))
