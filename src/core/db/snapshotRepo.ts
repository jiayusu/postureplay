// ============================================================
// 体态游乐场 PosturePlay — Snapshot Repository
// 管理姿态快照的批量写入与按会话查询
// ============================================================

import type { PostureSnapshot } from '@/types'
import { getDB } from './database'

/**
 * 批量存储姿态快照。
 * 每条快照使用 auto-increment 主键。
 */
export async function saveSnapshots(snapshots: PostureSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return
  const db = await getDB()
  const tx = db.transaction('posture_snapshots', 'readwrite')
  for (const snap of snapshots) {
    tx.store.add(snap)
  }
  await tx.done
}

/**
 * 按会话 ID 查询所有快照，按 timestamp 升序排列。
 */
export async function getSnapshotsBySession(
  sessionId: string,
): Promise<PostureSnapshot[]> {
  const db = await getDB()
  const index = db.transaction('posture_snapshots', 'readonly').store.index('sessionId')
  return index.getAll(sessionId)
}

/**
 * 获取所有快照（用于清理过期数据时遍历）。
 */
async function getAllSnapshots(): Promise<
  Array<PostureSnapshot & { id: number }>
> {
  const db = await getDB()
  return db.getAll('posture_snapshots') as Promise<
    Array<PostureSnapshot & { id: number }>
  >
}

/**
 * 获取所有会话的日期映射（sessionId → date），用于过期判断。
 */
async function getSessionDateMap(): Promise<Map<string, string>> {
  const db = await getDB()
  const allSessions = await db.getAll('sessions')
  const map = new Map<string, string>()
  for (const s of allSessions) {
    if (s.id && s.date) {
      map.set(s.id, s.date)
    }
  }
  return map
}

/**
 * 删除超过 retentionDays 天的快照。
 * 策略：先获取所有 sessionId→date 映射，再遍历所有快照，
 * 删除关联会话日期早于阈值的数据。
 */
export async function deleteOldSnapshots(retentionDays: number): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)
  const cutoffDate = cutoff.toISOString().slice(0, 10) // "YYYY-MM-DD"

  const sessionDateMap = await getSessionDateMap()
  const allSnapshots = await getAllSnapshots()

  const db = await getDB()
  const tx = db.transaction('posture_snapshots', 'readwrite')

  for (const snap of allSnapshots) {
    const date = sessionDateMap.get(snap.sessionId)
    if (date && date < cutoffDate) {
      // idb auto-increment key is stored on the record
      tx.store.delete(snap.id)
    }
  }

  await tx.done
}
