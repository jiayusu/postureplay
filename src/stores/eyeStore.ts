// ============================================================
// 体态游乐场 PosturePlay — eyeStore
//
// 管理人眼状态数据：面部关键点、眼态指标、模型加载状态、
// 融合反馈。
// ============================================================

import { create } from 'zustand'
import type { EyeStateMetrics, FusionFeedback } from '@/types/eye'
import { getEyeStateService } from '@/services/eye'
import { getFusionService } from '@/services/fusion'
import { usePostureStore } from './postureStore'

interface EyeState {
  /** 最新一帧面部关键点（478 点完整检测） */
  faceLandmarks: Array<{ x: number; y: number; z: number; visibility: number }> | null
  /** 最新眼态指标 */
  eyeMetrics: EyeStateMetrics | null
  /** 面部模型加载状态 */
  faceModelStatus: 'idle' | 'loading' | 'ready' | 'error'
  /** 面部模型加载进度 */
  faceModelProgress: number // 0-100
  /** 体态+眼态融合反馈 */
  fusionFeedback: FusionFeedback | null

  // Actions
  loadFaceModel(): Promise<void>
  updateFaceLandmarks(landmarks: Array<{ x: number; y: number; z: number; visibility: number }>): void
  computeAndUpdateEyeMetrics(): void
  updateFusionFeedback(): void
  resetEyeState(): void
}

export const useEyeStore = create<EyeState>((set, get) => ({
  // ── State ──
  faceLandmarks: null,
  eyeMetrics: null,
  faceModelStatus: 'idle',
  faceModelProgress: 0,
  fusionFeedback: null,

  // ── Actions ──

  loadFaceModel: async () => {
    const svc = getEyeStateService()
    set({ faceModelStatus: 'loading', faceModelProgress: 0 })

    try {
      await svc.initialize((pct) => {
        set({ faceModelProgress: pct })
      })
      set({ faceModelStatus: 'ready' })
    } catch (err) {
      console.error('[eyeStore] 面部模型加载失败:', err)
      set({ faceModelStatus: 'error' })
    }
  },

  updateFaceLandmarks: (landmarks) => {
    set({ faceLandmarks: landmarks })
  },

  computeAndUpdateEyeMetrics: () => {
    const svc = getEyeStateService()
    const { faceLandmarks } = get()

    if (!faceLandmarks || faceLandmarks.length < 468) return

    const metrics = svc.computeEyeMetrics(faceLandmarks)
    set({ eyeMetrics: metrics })
  },

  updateFusionFeedback: () => {
    const fusionSvc = getFusionService()
    const posture = usePostureStore.getState().metrics
    const eye = get().eyeMetrics

    const feedback = fusionSvc.fuse(posture, eye)
    set({ fusionFeedback: feedback })
  },

  resetEyeState: () => {
    set({
      faceLandmarks: null,
      eyeMetrics: null,
      fusionFeedback: null,
    })
  },
}))
