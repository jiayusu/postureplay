// ============================================================
// 体态游乐场 PosturePlay — handHealthRepo
//
// 手部健康数据 IndexedDB CRUD 操作。
// 存储每次手部检测的 HandHealthMetrics 和 CombinedHandMetrics。
// ============================================================

import { getDB } from './database'
import type { HandHealthMetrics, CombinedHandMetrics } from '@/types/hand'

/** 手部健康记录 */
export interface HandHealthRecord {
  id: string            // UUID
  date: string          // ISO date "2026-06-01"
  handedness: 'Left' | 'Right'
  timestamp: number
  metrics: HandHealthMetrics
}

/** 双手综合健康记录 */
export interface CombinedHandRecord {
  id: string            // UUID
  date: string          // ISO date
  timestamp: number
  metrics: CombinedHandMetrics
}

/** 保存单手健康指标 */
export async function saveHandMetrics(metrics: HandHealthMetrics): Promise<string> {
  const db = await getDB()
  const id = crypto.randomUUID()
  const date = new Date(metrics.timestamp).toISOString().split('T')[0]

  const record: HandHealthRecord = {
    id,
    date,
    handedness: metrics.handedness,
    timestamp: metrics.timestamp,
    metrics,
  }

  await db.put('hand_health', record)
  return id
}

/** 保存双手综合指标 */
export async function saveCombinedMetrics(metrics: CombinedHandMetrics): Promise<string> {
  const db = await getDB()
  const id = crypto.randomUUID()
  const date = new Date(metrics.timestamp).toISOString().split('T')[0]

  // 使用 settings store 存储组合数据（hand_health 仅存单手）
  const record: CombinedHandRecord = {
    id,
    date,
    timestamp: metrics.timestamp,
    metrics,
  }

  await db.put('settings', {
    key: `combined_hand_${date}`,
    value: record,
  })
  return id
}

/** 获取最近的手部健康记录 */
export async function getRecentHandMetrics(limit = 10): Promise<HandHealthRecord[]> {
  const db = await getDB()
  const records = await db.getAll('hand_health')
  return records
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
}

/** 获取指定日期的双手综合指标 */
export async function getCombinedMetricsByDate(date: string): Promise<CombinedHandRecord | null> {
  const db = await getDB()
  const record = await db.get('settings', `combined_hand_${date}`)
  return record?.value ?? null
}

/** 清理超过指定天数的旧数据 */
export async function cleanOldHandMetrics(retentionDays = 14): Promise<void> {
  const db = await getDB()
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const records = await db.getAll('hand_health')
  const tx = db.transaction('hand_health', 'readwrite')

  for (const record of records) {
    if (record.timestamp < cutoff) {
      await tx.store.delete(record.id)
    }
  }
  await tx.done
}
