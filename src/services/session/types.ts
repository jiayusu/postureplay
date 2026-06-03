/**
 * SessionService 模块类型定义
 *
 * 定义会话生命周期管理接口。
 */

import type { AppMode, PostureSnapshot, SessionSummary } from '@/types'

export type { SessionSummary }

/** SessionService 对外接口 */
export interface SessionServiceInterface {
  /** 开始新会话，返回 sessionId */
  startSession(mode: AppMode): string

  /** 记录一条姿态快照（自动补充 sessionId 并入 buffer） */
  recordSnapshot(
    snapshotData: Omit<PostureSnapshot, 'sessionId'>,
  ): void

  /** 结束当前会话：flush buffer → 计算摘要 → 持久化 → 清理旧数据 */
  endSession(): Promise<SessionSummary>

  /** 获取最近 N 天按日聚合的会话摘要 */
  getDailySummaries(days: number): Promise<SessionSummary[]>

  /** 当前是否有活跃会话 */
  isActive(): boolean

  /** 当前活跃会话的 ID，无会话时为 null */
  getCurrentSessionId(): string | null
}

/** 每批次 flush 的快照数量 */
export const SNAPSHOT_FLUSH_INTERVAL = 30

/** 快照保留天数（超过后定时清理） */
export const SNAPSHOT_RETENTION_DAYS = 14
