// ============================================================
// 体态游乐场 PosturePlay — sessionStore
//
// 管理当前会话的生命周期：
//   启动/结束会话、模式切换、中立位计时、快照缓冲。
// session 未就绪时的快照先入 buffer，start 后自动 flush。
// ============================================================

import { create } from 'zustand'
import type { AppMode, PostureSnapshot, SessionSummary } from '@/types'
import {
  getSessionService,
} from '@/services/session'

// ---- State & Actions ----

interface SessionState {
  currentSessionId: string | null
  mode: AppMode
  isActive: boolean
  startTime: number | null
  neutralTimer: number
  snapshotBuffer: PostureSnapshot[]

  startSession(mode: AppMode): void
  endSession(): Promise<SessionSummary | undefined>
  switchMode(mode: AppMode): void
  tickNeutral(isNeutral: boolean, deltaSeconds: number, snapshot?: Omit<PostureSnapshot, 'sessionId'>): void
  persistSnapshot(snapshot: Omit<PostureSnapshot, 'sessionId'>): void
  getRecentDailySummaries(days: number): Promise<SessionSummary[]>
}

// ---- Store ----

export const useSessionStore = create<SessionState>((set, get) => ({
  // ── State ──
  currentSessionId: null,
  mode: 'work',
  isActive: false,
  startTime: null,
  neutralTimer: 0,
  snapshotBuffer: [],

  // ── Actions ──

  startSession: (mode: AppMode) => {
    const svc = getSessionService()

    // 已有活跃会话时幂等返回（React StrictMode 双重调用兼容）
    const { isActive } = get()
    if (isActive) return

    const sessionId = svc.startSession(mode)

    set({
      currentSessionId: sessionId,
      mode,
      isActive: true,
      startTime: Date.now(),
      neutralTimer: 0,
    })

    // flush 缓冲中的快照
    const { snapshotBuffer } = get()
    if (snapshotBuffer.length > 0) {
      for (const snap of snapshotBuffer) {
        svc.recordSnapshot(snap)
      }
      set({ snapshotBuffer: [] })
    }
  },

  endSession: async () => {
    const svc = getSessionService()
    // 无活跃会话时静默返回，避免组件 unmount 时抛错
    if (!get().isActive || !get().currentSessionId) return
    try {
      const summary = await svc.endSession()
      set({
        currentSessionId: null,
        isActive: false,
        neutralTimer: 0,
        startTime: null,
      })
      return summary
    } catch (err) {
      console.error('[sessionStore] 结束会话失败:', err)
      // 即便失败也清理状态
      set({
        currentSessionId: null,
        isActive: false,
      })
      throw err
    }
  },

  switchMode: (mode: AppMode) => {
    set({ mode })
  },

  tickNeutral: (isNeutral: boolean, deltaSeconds: number, snapshot?: Omit<PostureSnapshot, 'sessionId'>) => {
    const { isActive } = get()
    if (!isActive) return

    // 持久化快照
    if (snapshot) {
      get().persistSnapshot(snapshot)
    }

    // 中立位计时
    if (isNeutral) {
      const prev = get().neutralTimer
      set({ neutralTimer: prev + deltaSeconds })
    }
  },

  persistSnapshot: (snapshot: Omit<PostureSnapshot, 'sessionId'>) => {
    const svc = getSessionService()
    const id = get().currentSessionId

    if (id) {
      // session 已就绪 → 直接写入
      svc.recordSnapshot(snapshot)
    } else {
      // session 未就绪 → 缓冲
      set((state) => ({
        snapshotBuffer: [...state.snapshotBuffer, snapshot as PostureSnapshot],
      }))
    }
  },

  getRecentDailySummaries: async (days: number) => {
    const svc = getSessionService()
    return svc.getDailySummaries(days)
  },
}))
