// ============================================================
// 体态游乐场 PosturePlay — Session Repository
// 管理会话摘要的 IndexedDB 持久化
// ============================================================

import type { SessionSummary } from '@/types'
import { getDB } from './database'

/**
 * 保存一条会话摘要（使用 put 支持覆盖更新）。
 */
export async function saveSession(summary: SessionSummary): Promise<void> {
  const db = await getDB()
  await db.put('sessions', summary)
}

/**
 * 按日期范围查询会话摘要（含起止日期）。
 * date 格式为 "YYYY-MM-DD"，使用 index 游标范围查询。
 */
export async function getSessionsByDateRange(
  startDate: string,
  endDate: string,
): Promise<SessionSummary[]> {
  const db = await getDB()
  const tx = db.transaction('sessions', 'readonly')
  const index = tx.store.index('date')
  const range = IDBKeyRange.bound(startDate, endDate)
  return index.getAll(range)
}

/**
 * 获取最近 N 天的所有会话（从今天往前推 N 天）。
 */
export async function getRecentSessions(days: number): Promise<SessionSummary[]> {
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - days)

  const startDate = start.toISOString().slice(0, 10) // "YYYY-MM-DD"
  const endDate = today.toISOString().slice(0, 10)

  return getSessionsByDateRange(startDate, endDate)
}
