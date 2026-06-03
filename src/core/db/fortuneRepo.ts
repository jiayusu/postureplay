// ============================================================
// 体态游乐场 PosturePlay — Fortune Repository
// 管理每日运势的持久化
// ============================================================

import type { DailyFortune } from '@/types'
import { getDB } from './database'

/**
 * 保存一条每日运势（幂等：相同 date 覆盖旧记录）。
 */
export async function saveFortune(fortune: DailyFortune): Promise<void> {
  const db = await getDB()
  await db.put('fortunes', fortune)
}

/**
 * 按日期查询运势，无记录时返回 null。
 */
export async function getFortuneByDate(date: string): Promise<DailyFortune | null> {
  const db = await getDB()
  const fortune = await db.get('fortunes', date)
  return fortune ?? null
}
