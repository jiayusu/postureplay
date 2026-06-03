/**
 * FortuneService 模块类型定义
 *
 * 每日运势服务：基于过去 7 天体态数据生成趣味化运势文案（伪占卜风格）。
 */

import type { DailyFortune, SessionSummary } from '@/types'

/** 运势文案模板 */
export interface FortuneTemplate {
  /** 唯一标识（用于调试/测试） */
  id: string

  /** 触发条件描述 */
  condition: string

  /** 运势正文模板（含 {highlight} {score} {day} 等占位符） */
  fortuneText: string

  /** 亮点短句（不含占位符） */
  highlight: string

  /** 体态建议（不含占位符） */
  tip: string

  /**
   * 匹配度函数：评分越高表示越匹配当前数据
   * @param trend - 趋势方向
   * @param isPeakToday - 今天是否是峰值
   * @param avgNeutralRatio - 7 日平均中立位占比
   * @param avgStillnessPeak - 7 日平均静止时长
   * @returns 匹配得分 (0 = 不匹配, higher = 更匹配)
   */
  match(
    trend: 'up' | 'down' | 'stable',
    isPeakToday: boolean,
    avgNeutralRatio: number,
    avgStillnessPeak: number,
  ): number
}

/** FortuneService 对外接口 */
export interface FortuneServiceInterface {
  /**
   * 生成今日运势
   * - 若 sessions 为空（首次使用），返回预告运势
   * - 若 sessions < 3 天，返回"数据不足"提示
   * - 否则基于 7 天数据匹配模板生成个性化运势
   */
  generate(sessions: SessionSummary[]): DailyFortune

  /** 获取今日运势缓存（从 IndexedDB 读取） */
  getToday(): Promise<DailyFortune | null>

  /** 保存今日运势到 IndexedDB */
  saveToday(fortune: DailyFortune): Promise<void>

  /**
   * 生成首次使用预告运势（无历史数据时的引导文案）
   * 直接返回固定 DailyFortune，不依赖任何数据。
   */
  generatePreviewFortune(): DailyFortune
}

/** 今日日期字符串 "YYYY-MM-DD" */
export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}
