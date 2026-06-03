// ============================================================
// 体态游乐场 PosturePlay — calibrationStore
//
// 管理 30s 校准流程：采样收集、进度追踪、最终化、重置。
// finalize 后自动同步 baselineKeypoints 到 postureStore。
// ============================================================

import { create } from 'zustand'
import type { Keypoint, CalibrationData } from '@/types'
import { getCalibrationService } from '@/services/calibration'
import { usePostureStore } from './postureStore'

// ---- State & Actions ----

interface CalibrationState {
  phase: 'idle' | 'calibrating' | 'complete' | 'error'
  progress: number // 0-100
  samples: Keypoint[][]
  result: CalibrationData | null

  startCalibration(): void
  addSample(kps: Keypoint[]): void
  finalize(): Promise<CalibrationData>
  reset(): void
  loadExisting(): Promise<CalibrationData | null>
}

// ---- Store ----

export const useCalibrationStore = create<CalibrationState>((set, get) => ({
  // ── State ──
  phase: 'idle',
  progress: 0,
  samples: [],
  result: null,

  // ── Actions ──

  startCalibration: () => {
    set({ phase: 'calibrating', progress: 0, samples: [], result: null })
  },

  addSample: (kps: Keypoint[]) => {
    const { samples } = get()
    const updated = [...samples, kps]
    // 按 60 帧满进度推算百分比（约 30s × 2fps 有效采集率）
    const progress = Math.min(Math.round((updated.length / 60) * 100), 100)
    set({ samples: updated, progress })
  },

  finalize: async () => {
    const svc = getCalibrationService()
    const { samples } = get()

    try {
      const result = await svc.finalize(samples)
      set({ result, phase: 'complete' })

      // 同步 baseline 到 postureStore
      usePostureStore.getState().setBaseline(result.baselineKeypoints)

      return result
    } catch (err) {
      console.error('[calibrationStore] 校准失败:', err)
      set({ phase: 'error' })
      throw err
    }
  },

  reset: () => {
    set({ phase: 'idle', progress: 0, samples: [], result: null })
  },

  loadExisting: async () => {
    const svc = getCalibrationService()
    const existing = await svc.getLatest()
    if (existing) {
      set({ result: existing, phase: 'complete' })
      usePostureStore.getState().setBaseline(existing.baselineKeypoints)
    }
    return existing
  },
}))
