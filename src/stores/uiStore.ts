// ============================================================
// 体态游乐场 PosturePlay — uiStore
//
// 管理全局 UI 状态：
//   路由、引导步骤、设置面板、提示条、性能降级等级。
//
// 阶段十五更新：
//   - isPerformanceMode (boolean) → degradationLevel (DegradationLevel)
//   - 保留 setPerformanceMode 向后兼容
//   - 新增 setDegradationLevel / getDegradationLevel
// ============================================================

import { create } from 'zustand'
import type { DegradationLevel } from '@/types'

// ---- Types ----

export type PageId =
  | 'loading'
  | 'onboarding'
  | 'calibration'
  | 'mirror'
  | 'fortune'

export interface AlertBanner {
  type: 'info' | 'warning' | 'error' | 'success'
  message: string
}

// ---- State & Actions ----

interface UIState {
  currentPage: PageId
  onboardingStep: number
  showSettings: boolean
  alertBanner: AlertBanner | null
  isPerformanceMode: boolean
  degradationLevel: DegradationLevel

  navigate(page: PageId): void
  nextOnboardingStep(): void
  prevOnboardingStep(): void
  toggleSettings(): void
  showAlert(banner: AlertBanner): void
  dismissAlert(): void

  /** @deprecated 使用 setDegradationLevel 替代 */
  setPerformanceMode(on: boolean): void
  setDegradationLevel(level: DegradationLevel): void
}

// ---- Store ----

export const useUIStore = create<UIState>((set) => ({
  // ── State ──
  currentPage: 'loading',
  onboardingStep: 0,
  showSettings: false,
  alertBanner: null,
  isPerformanceMode: false,
  degradationLevel: 'none',

  // ── Actions ──

  navigate: (page: PageId) => {
    set({ currentPage: page })
  },

  nextOnboardingStep: () => {
    set((state) => ({
      onboardingStep: Math.min(state.onboardingStep + 1, 2),
    }))
  },

  prevOnboardingStep: () => {
    set((state) => ({
      onboardingStep: Math.max(state.onboardingStep - 1, 0),
    }))
  },

  toggleSettings: () => {
    set((state) => ({ showSettings: !state.showSettings }))
  },

  showAlert: (banner: AlertBanner) => {
    set({ alertBanner: banner })
  },

  dismissAlert: () => {
    set({ alertBanner: null })
  },

  // @deprecated
  setPerformanceMode: (on: boolean) => {
    set({
      isPerformanceMode: on,
      degradationLevel: on ? 'level1' : 'none',
    })
  },

  setDegradationLevel: (level: DegradationLevel) => {
    set({
      degradationLevel: level,
      isPerformanceMode: level !== 'none',
    })
  },
}))
