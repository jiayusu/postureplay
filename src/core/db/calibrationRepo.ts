// ============================================================
// 体态游乐场 PosturePlay — Calibration Repository
// 管理校准数据的 IndexedDB 持久化
// ============================================================

import type { CalibrationData } from '@/types'
import { getDB } from './database'

/**
 * 保存一条校准数据。
 * 每次校准都会生成新的 id，旧数据保留（getLatestCalibration 取最新的）。
 */
export async function saveCalibration(data: CalibrationData): Promise<void> {
  const db = await getDB()
  await db.put('calibration', data)
}

/**
 * 获取最新的校准记录（按 createdAt 降序取第一条）。
 * 如果表中无记录，返回 null。
 */
export async function getLatestCalibration(): Promise<CalibrationData | null> {
  const db = await getDB()
  const records = await db.getAllFromIndex('calibration', 'createdAt')
  if (records.length === 0) return null
  // getAllFromIndex 按 key 升序返回，最新记录在末尾
  return records[records.length - 1]
}

/**
 * 清空所有校准数据（通常在用户重新校准时调用）。
 */
export async function deleteAllCalibrations(): Promise<void> {
  const db = await getDB()
  await db.clear('calibration')
}
