// ============================================================
// 体态游乐场 PosturePlay — SessionService
//
// 管理单次会话的完整生命周期：
//   start → recordSnapshot × N → end → persist + cleanup
//
// 内存 buffer 每 SNAPSHOT_FLUSH_INTERVAL 条批量写入 IndexedDB，
// 避免高频写入阻塞主线程。
// ============================================================

import type { AppMode, PostureSnapshot, SessionSummary } from '@/types'
import {
  saveSession,
  getRecentSessions,
} from '@/core/db/sessionRepo'
import {
  saveSnapshots,
  getSnapshotsBySession,
  deleteOldSnapshots,
} from '@/core/db/snapshotRepo'
import { SNAPSHOT_FLUSH_INTERVAL, SNAPSHOT_RETENTION_DAYS } from './types'
import type { SessionServiceInterface } from './types'

// ---- UUID 生成（兼容所有现代浏览器）----

function generateId(): string {
  return crypto.randomUUID()
}

/** 从时间戳提取日期字符串 "YYYY-MM-DD" */
function toDateString(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

// ============================================================
// SessionService 实现
// ============================================================

export class SessionService implements SessionServiceInterface {
  private sessionId: string | null = null
  private mode: AppMode = 'work'
  private startTime: number = 0
  private buffer: PostureSnapshot[] = []

  // ---- 生命周期 ----

  startSession(mode: AppMode): string {
    // 已有活跃会话时直接返回现有 ID（React StrictMode 开发模式会双重调用 effect）
    if (this.sessionId !== null) {
      return this.sessionId
    }

    this.sessionId = generateId()
    this.mode = mode
    this.startTime = Date.now()
    this.buffer = []

    return this.sessionId
  }

  // ---- 快照记录 ----

  recordSnapshot(
    snapshotData: Omit<PostureSnapshot, 'sessionId'>,
  ): void {
    if (!this.sessionId) {
      console.warn('[SessionService] 无活跃会话，快照被丢弃')
      return
    }

    const snap: PostureSnapshot = {
      ...snapshotData,
      sessionId: this.sessionId,
    }

    this.buffer.push(snap)

    if (this.buffer.length >= SNAPSHOT_FLUSH_INTERVAL) {
      const toFlush = this.buffer.splice(0, SNAPSHOT_FLUSH_INTERVAL)
      // 异步 flush，不阻塞调用方
      saveSnapshots(toFlush).catch((err) => {
        console.error('[SessionService] flush 失败:', err)
      })
    }
  }

  // ---- 结束会话 ----

  async endSession(): Promise<SessionSummary> {
    if (!this.sessionId) {
      throw new Error('[SessionService] 无活跃会话，无法结束')
    }

    const sessionId = this.sessionId
    const endTime = Date.now()
    const duration = Math.round((endTime - this.startTime) / 1000)

    // 1. 刷新 buffer 中剩余快照
    if (this.buffer.length > 0) {
      await saveSnapshots(this.buffer)
      this.buffer = []
    }

    // 2. 从 IndexedDB 取出本次会话所有快照
    const snapshots = await getSnapshotsBySession(sessionId)

    // 3. 计算摘要指标
    const summary = this.computeSummary(snapshots, sessionId, duration)

    // 4. 持久化会话摘要
    await saveSession(summary)

    // 5. 清理过期快照（异步，不阻塞）
    deleteOldSnapshots(SNAPSHOT_RETENTION_DAYS).catch((err) => {
      console.error('[SessionService] 旧快照清理失败:', err)
    })

    // 6. 重置状态
    this.sessionId = null
    this.startTime = 0
    this.mode = 'work'

    return summary
  }

  // ---- 日聚合查询 ----

  async getDailySummaries(days: number): Promise<SessionSummary[]> {
    const sessions = await getRecentSessions(days)
    return this.aggregateDaily(sessions)
  }

  // ---- 状态查询 ----

  isActive(): boolean {
    return this.sessionId !== null
  }

  getCurrentSessionId(): string | null {
    return this.sessionId
  }

  // ============================================================
  // Private
  // ============================================================

  /**
   * 从快照列表计算会话摘要。
   */
  private computeSummary(
    snapshots: PostureSnapshot[],
    sessionId: string,
    duration: number,
  ): SessionSummary {
    const n = snapshots.length

    // 无快照时的默认值
    if (n === 0) {
      return {
        id: sessionId,
        date: toDateString(this.startTime),
        mode: this.mode,
        startTime: this.startTime,
        endTime: Date.now(),
        duration: 0,
        neutralDuration: 0,
        neutralRatio: 0,
        avgSpineAngle: 0,
        avgHeadAngle: 0,
        stillnessPeak: 0,
        emotionalStateDistribution: {},
      }
    }

    // 中立位累计
    let neutralCount = 0
    // 连续中立位计数器（用于计算静止峰值）
    let consecNeutral = 0
    let maxConsecNeutral = 0

    // 累加器
    let sumSpineAngle = 0
    let sumHeadAngle = 0
    const emotionCount: Record<string, number> = {}

    for (const snap of snapshots) {
      if (snap.isNeutral) {
        neutralCount++
        consecNeutral++
        if (consecNeutral > maxConsecNeutral) {
          maxConsecNeutral = consecNeutral
        }
      } else {
        consecNeutral = 0
      }

      sumSpineAngle += snap.spineAngle
      sumHeadAngle += snap.headForwardAngle

      const emo = snap.emotionalState || 'unknown'
      emotionCount[emo] = (emotionCount[emo] || 0) + 1
    }

    const avgSpineAngle = sumSpineAngle / n
    const avgHeadAngle = sumHeadAngle / n

    // 情绪分布（转换为占比）
    const emotionalStateDistribution: Record<string, number> = {}
    for (const [key, count] of Object.entries(emotionCount)) {
      emotionalStateDistribution[key] = count / n
    }

    return {
      id: sessionId,
      date: toDateString(this.startTime),
      mode: this.mode,
      startTime: this.startTime,
      endTime: Date.now(),
      duration,
      neutralDuration: neutralCount, // 每个快照 ≈ 1 秒
      neutralRatio: n > 0 ? neutralCount / n : 0,
      avgSpineAngle,
      avgHeadAngle,
      stillnessPeak: maxConsecNeutral, // 连续中立位帧数 ≈ 秒数
      emotionalStateDistribution,
    }
  }

  /**
   * 按日期聚合多条会话摘要。
   *
   * 同一天多条 session 的：
   *   - duration / neutralDuration 求和
   *   - avgSpineAngle / avgHeadAngle 按 duration 加权平均
   *   - stillnessPeak 取最大值
   *   - emotionalStateDistribution 按 duration 加权合并
   */
  private aggregateDaily(sessions: SessionSummary[]): SessionSummary[] {
    const byDate = new Map<
      string,
      { sessions: SessionSummary[]; totalDuration: number }
    >()

    for (const s of sessions) {
      const entry = byDate.get(s.date)
      if (entry) {
        entry.sessions.push(s)
        entry.totalDuration += s.duration
      } else {
        byDate.set(s.date, { sessions: [s], totalDuration: s.duration })
      }
    }

    const result: SessionSummary[] = []

    for (const [date, group] of byDate) {
      const { sessions: groupSessions, totalDuration } = group
      if (groupSessions.length === 1) {
        // 单条无需聚合
        result.push(groupSessions[0])
        continue
      }

      // 聚合多条
      let aggDuration = 0
      let aggNeutral = 0
      let aggSpineWeighted = 0
      let aggHeadWeighted = 0
      let aggStillnessPeak = 0
      const aggEmotion: Record<string, number> = {}

      for (const s of groupSessions) {
        aggDuration += s.duration
        aggNeutral += s.neutralDuration
        aggSpineWeighted += s.avgSpineAngle * s.duration
        aggHeadWeighted += s.avgHeadAngle * s.duration
        if (s.stillnessPeak > aggStillnessPeak) {
          aggStillnessPeak = s.stillnessPeak
        }

        // 情绪分布加权合并
        for (const [emo, ratio] of Object.entries(
          s.emotionalStateDistribution,
        )) {
          aggEmotion[emo] =
            (aggEmotion[emo] || 0) + ratio * s.duration
        }
      }

      // 归一化情绪分布
      const normalizedEmotion: Record<string, number> = {}
      for (const [emo, weighted] of Object.entries(aggEmotion)) {
        normalizedEmotion[emo] =
          totalDuration > 0 ? weighted / totalDuration : 0
      }

      result.push({
        id: `agg-${date}`,
        date,
        mode: groupSessions[0].mode,
        startTime: groupSessions[0].startTime,
        endTime: groupSessions[groupSessions.length - 1].endTime,
        duration: aggDuration,
        neutralDuration: aggNeutral,
        neutralRatio: aggDuration > 0 ? aggNeutral / aggDuration : 0,
        avgSpineAngle:
          totalDuration > 0 ? aggSpineWeighted / totalDuration : 0,
        avgHeadAngle:
          totalDuration > 0 ? aggHeadWeighted / totalDuration : 0,
        stillnessPeak: aggStillnessPeak,
        emotionalStateDistribution: normalizedEmotion,
      })
    }

    // 按日期排序（降序，最近的在前面）
    result.sort((a, b) => b.date.localeCompare(a.date))

    return result
  }
}

// ---- 模块级单例 ----

let instance: SessionService | null = null

export function getSessionService(): SessionService {
  if (!instance) {
    instance = new SessionService()
  }
  return instance
}
