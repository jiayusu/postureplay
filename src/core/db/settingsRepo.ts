// ============================================================
// 体态游乐场 PosturePlay — Settings Repository
// 管理全局设置的 key-value 存储与默认值回退
// ============================================================

import type { AppSettings } from '@/types'
import { getDB } from './database'

/** AppSettings 各字段的默认值 */
const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  cameraFacing: 'user',
  language: 'zh-CN',
  onboardingCompleted: false,
  firstVisitDate: '',
  visitCount: 0,
}

/**
 * 读取单个设置项。key 不存在时返回 undefined。
 */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDB()
  const record: { key: string; value: T } | undefined = await db.get('settings', key)
  return record?.value
}

/**
 * 写入单个设置项。
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB()
  await db.put('settings', { key, value })
}

/**
 * 读取全部设置，混合已存值和默认值。
 * 已存储的字段优先，缺失字段使用 DEFAULT_SETTINGS 填充。
 */
export async function getAllSettings(): Promise<AppSettings> {
  const db = await getDB()
  const all: Array<{ key: string; value: unknown }> = await db.getAll('settings')

  const result: AppSettings = { ...DEFAULT_SETTINGS }

  for (const { key, value } of all) {
    ;(result as unknown as Record<string, unknown>)[key] = value
  }

  return result
}
