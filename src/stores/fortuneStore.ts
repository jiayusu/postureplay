// ============================================================
// 体态游乐场 PosturePlay — fortuneStore
//
// 管理每日运势数据：
//   加载今日运势（缓存优先）、生成运势（基于 7 天摘要）。
// ============================================================

import { create } from 'zustand'
import type { DailyFortune } from '@/types'
import { getFortuneService } from '@/services/fortune'
import { FORTUNE_LOOKBACK_DAYS } from '@/constants/config'
import { useSessionStore } from './sessionStore'

// ---- State & Actions ----

interface FortuneState {
  todayFortune: DailyFortune | null
  isGenerating: boolean

  loadToday(): Promise<DailyFortune>
  generate(): Promise<DailyFortune>
}

// ---- Store ----

export const useFortuneStore = create<FortuneState>((set, get) => ({
  // ── State ──
  todayFortune: null,
  isGenerating: false,

  // ── Actions ──

  loadToday: async () => {
    const svc = getFortuneService()

    // 1. 先查缓存
    const cached = await svc.getToday()
    if (cached) {
      set({ todayFortune: cached, isGenerating: false })
      return cached
    }

    // 2. 无缓存 → 即时生成
    return get().generate()
  },

  generate: async () => {
    const svc = getFortuneService()
    set({ isGenerating: true })

    try {
      // 从 sessionStore 获取最近 N 天摘要
      const summaries = await useSessionStore
        .getState()
        .getRecentDailySummaries(FORTUNE_LOOKBACK_DAYS)

      const fortune = svc.generate(summaries)

      // 写入 IndexedDB 缓存
      await svc.saveToday(fortune)

      set({ todayFortune: fortune, isGenerating: false })
      return fortune
    } catch (err) {
      console.error('[fortuneStore] 运势生成失败:', err)
      set({ isGenerating: false })
      throw err
    }
  },
}))
