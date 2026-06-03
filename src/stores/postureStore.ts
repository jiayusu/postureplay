// ============================================================
// 体态游乐场 PosturePlay — postureStore
//
// 管理实时姿态数据：关键点、体态指标、模型加载状态、
// 静止检测（stillnessAccumulator）、baseline 引用。
// ============================================================

import { create } from 'zustand'
import type { Keypoint, PostureMetrics } from '@/types'
import { getPostureService } from '@/services/posture'

// ---- State & Actions ----

interface PostureState {
  keypoints: Keypoint[] | null
  metrics: PostureMetrics | null
  baselineKeypoints: Keypoint[] | null
  modelStatus: 'idle' | 'loading' | 'ready' | 'error'
  modelProgress: number // 0-100
  previousKeypoints: Keypoint[] | null
  stillnessAccumulator: number // 累计静止秒数
  performanceMetrics: { avgInferenceTime: number }

  loadModel(): Promise<void>
  updateKeypoints(kps: Keypoint[]): void
  computeAndUpdateMetrics(baseline?: Keypoint[] | null): void
  setBaseline(kps: Keypoint[]): void
  resetStillness(): void
  setPerformanceMetrics(partial: Partial<{ avgInferenceTime: number }>): void
}

// ---- Store ----

export const usePostureStore = create<PostureState>((set, get) => ({
  // ── State ──
  keypoints: null,
  metrics: null,
  baselineKeypoints: null,
  modelStatus: 'idle',
  modelProgress: 0,
  previousKeypoints: null,
  stillnessAccumulator: 0,
  performanceMetrics: { avgInferenceTime: 0 },

  // ── Actions ──

  loadModel: async () => {
    const svc = getPostureService()
    set({ modelStatus: 'loading', modelProgress: 0 })

    try {
      await svc.initialize((pct) => {
        set({ modelProgress: pct })
      })
      set({ modelStatus: 'ready' })
    } catch (err) {
      console.error('[postureStore] 模型加载失败:', err)
      set({ modelStatus: 'error' })
    }
  },

  updateKeypoints: (kps: Keypoint[]) => {
    const prev = get().keypoints
    set({
      keypoints: kps,
      previousKeypoints: prev,
    })
  },

  computeAndUpdateMetrics: (baseline?: Keypoint[] | null) => {
    const svc = getPostureService()
    const { keypoints, previousKeypoints } = get()

    if (!keypoints) return

    const base = baseline ?? get().baselineKeypoints

    // 第一步：始终重新计算几何指标（spineAngle / shoulderDiff / headAngle / isNeutral）
    const freshMetrics = svc.computeMetrics(keypoints, base)

    // 第二步：叠加增量时间数据（stillnessDuration / breathMode / emotionalState）
    const computed = svc.updateStillnessAndEmotion(freshMetrics, keypoints, previousKeypoints)

    // 更新静止累加器（使用实际毫秒增量换算为秒）
    if (computed.isNeutral) {
      const prev = get().stillnessAccumulator
      // stillnessDuration 是毫秒，累加器记录秒数
      set({ stillnessAccumulator: prev + computed.stillnessDuration / 1000 })
    }

    set({ metrics: computed })
  },

  setBaseline: (kps: Keypoint[]) => {
    set({ baselineKeypoints: kps })
  },

  resetStillness: () => {
    set({ stillnessAccumulator: 0 })
  },

  setPerformanceMetrics: (partial) => {
    set((s) => ({
      performanceMetrics: { ...s.performanceMetrics, ...partial },
    }))
  },
}))
