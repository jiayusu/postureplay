// ============================================================
// 体态游乐场 PosturePlay — FortuneService
//
// 基于过去 7 天体态数据生成趣味化每日运势（伪占卜风格）。
//
// 核心流程：
//   generate(sessions) → 计算趋势 + 评分 → 匹配模板 → 填充占位符 → DailyFortune
// ============================================================

import type { DailyFortune, SessionSummary } from '@/types'
import { saveFortune, getFortuneByDate } from '@/core/db/fortuneRepo'
import { todayDateString } from './types'
import type { FortuneServiceInterface, FortuneTemplate } from './types'

// ============================================================
// 文案模板库（18 个模板，覆盖所有场景）
// ============================================================

const TEMPLATES: FortuneTemplate[] = [
  // ── 趋势上升 + 今天峰值 ──
  {
    id: 'up-peak-today-1',
    condition: '趋势上升 + 今天峰值（高利用率）',
    fortuneText:
      '今日尾椎电力满格！中立位占比冲到 {score} 分，是近 {day} 天最佳。下午开会记得保持这份气场，你的尾巴比谁都骄傲 ✨',
    highlight: '近{day}天最佳姿态',
    tip: '保持今日节奏，每 45 分钟站起来活动一下',
    match(trend, isPeakToday, _avgNeutralRatio) {
      if (trend !== 'up' || !isPeakToday) return 0
      let score = 10
      if (_avgNeutralRatio >= 0.5) score += 8
      else if (_avgNeutralRatio >= 0.35) score += 5
      else score += 2
      return score
    },
  },
  {
    id: 'up-peak-today-2',
    condition: '趋势上升 + 今天峰值（稳步进步）',
    fortuneText:
      '你的体态正在悄悄进化！今天中立位比例再创新高，尾巴评分 {score}。{highlight}，继续保持，你的脊椎会感谢你的 🌱',
    highlight: '稳步进步中',
    tip: '尝试在站立时微微收腹，效果更好',
    match(trend, isPeakToday, _avgNeutralRatio) {
      if (trend !== 'up' || !isPeakToday) return 0
      if (_avgNeutralRatio >= 0.5) return 7
      if (_avgNeutralRatio >= 0.35) return 9
      return 6
    },
  },

  // ── 趋势上升 + 峰值在前几天 ──
  {
    id: 'up-peak-earlier-1',
    condition: '趋势上升 + 峰值已过（整体向好）',
    fortuneText:
      '虽然今天不是最佳状态，但你的 {day} 日趋势稳稳向上。评分 {score} 分，{highlight}。偶尔的波动只是身体在调试 📈',
    highlight: '整体趋势向好',
    tip: '注意肩膀不要耸起，放松斜方肌',
    match(trend, isPeakToday, _avgNeutralRatio) {
      if (trend !== 'up' || isPeakToday) return 0
      if (_avgNeutralRatio >= 0.45) return 10
      if (_avgNeutralRatio >= 0.35) return 7
      return 5
    },
  },
  {
    id: 'up-peak-earlier-2',
    condition: '趋势上升 + 峰值已过（温和上升）',
    fortuneText:
      '尾巴运势 {score} 分，虽然今天有些小波动，但近 {day} 天整体呈上升趋势。{highlight}。身体正在找到它的节奏 🎵',
    highlight: '温和上升通道中',
    tip: '多做肩颈拉伸，办公族的必修课',
    match(trend, isPeakToday, _avgNeutralRatio) {
      if (trend !== 'up' || isPeakToday) return 0
      return 5
    },
  },

  // ── 趋势下降 + 静止增多 ──
  {
    id: 'down-stillness-1',
    condition: '趋势下降 + 静止时间增多（久坐警告）',
    fortuneText:
      '⚠️ 尾椎检测到石化前兆！近 {day} 天静止时间持续增加，中立位占比下滑至 {score} 分。{highlight}，该站起来抖一抖了',
    highlight: '久坐时间在增加',
    tip: '设置一个 30 分钟站立提醒，打破石化诅咒',
    match(trend, _isPeakToday, _avgNeutralRatio, avgStillnessPeak) {
      if (trend !== 'down') return 0
      if (avgStillnessPeak >= 120) return 10
      if (avgStillnessPeak >= 60) return 7
      return 3
    },
  },
  {
    id: 'down-stillness-2',
    condition: '趋势下降 + 静止增多（需要活动）',
    fortuneText:
      '尾巴悄悄告诉你：它快僵住了。近 {day} 天体态评分 {score}，{highlight}。石化程度正在加深，趁着还没变成石像，起来走走吧 🪨',
    highlight: '活动量偏低',
    tip: '试试"番茄工作法"，25 分钟工作 + 5 分钟活动',
    match(trend, _isPeakToday, _avgNeutralRatio, _avgStillnessPeak) {
      if (trend !== 'down') return 0
      return 4
    },
  },

  // ── 趋势下降 + 整体偏低 ──
  {
    id: 'down-low-1',
    condition: '趋势下降 + 中立位整体偏低（需要关注）',
    fortuneText:
      '这 {day} 天的体态数据不太理想，评分 {score} 分。{highlight}。别担心，体态和心情一样有起伏，明天会是新的一天 💪',
    highlight: '今天的低谷是明天的起跳板',
    tip: '睡前做 5 分钟猫牛式拉伸，放松整条脊柱',
    match(trend, _isPeakToday, avgNeutralRatio) {
      if (trend !== 'down') return 0
      if (avgNeutralRatio < 0.35) return 10
      if (avgNeutralRatio < 0.5) return 6
      return 3
    },
  },
  {
    id: 'down-low-2',
    condition: '趋势下降 + 中立位偏低（反转预告）',
    fortuneText:
      '尾巴运势 {score} 分，最近姿势有点放飞自我啊。{highlight}。不过运势这东西，触底就该反弹了 🔮',
    highlight: '触底反弹在即',
    tip: '工作时把显示器垫高到视线水平，立竿见影',
    match(trend, _isPeakToday, _avgNeutralRatio) {
      if (trend !== 'down') return 0
      return 4
    },
  },

  // ── 趋势平稳 + 中等水平 ──
  {
    id: 'stable-medium-1',
    condition: '趋势平稳 + 中等中立位占比（巡航模式）',
    fortuneText:
      '身体进入了巡航模式 🚢 近 {day} 天评分稳定在 {score} 分，{highlight}。平稳是好事，但别让尾巴太无聊哦',
    highlight: '巡航模式中',
    tip: '偶尔换换坐姿，给不同的肌肉群轮班',
    match(trend, _isPeakToday, avgNeutralRatio) {
      if (trend !== 'stable') return 0
      if (avgNeutralRatio >= 0.35 && avgNeutralRatio < 0.6) return 10
      if (avgNeutralRatio >= 0.3 && avgNeutralRatio < 0.35) return 7
      return 3
    },
  },
  {
    id: 'stable-medium-2',
    condition: '趋势平稳 + 中等水平（稳定发挥）',
    fortuneText:
      '姿势稳定得像一座山 ⛰️ 评分 {score} 分，{highlight}。这样的状态最适合专注工作，别再分心刷手机了',
    highlight: '稳如泰山',
    tip: '保持呼吸均匀，腹式呼吸能让身体更放松',
    match(trend, _isPeakToday, avgNeutralRatio) {
      if (trend !== 'stable') return 0
      if (avgNeutralRatio >= 0.35 && avgNeutralRatio < 0.6) return 7
      return 2
    },
  },

  // ── 趋势平稳 + 高基线 ──
  {
    id: 'stable-high-1',
    condition: '趋势平稳 + 中立位高占比（优等生）',
    fortuneText:
      '👑 尾巴对你的表现非常满意！近 {day} 天体态评分高达 {score} 分，{highlight}。你这姿势，堪称教科书级别',
    highlight: '教科书级体态',
    tip: '可以挑战单腿站立刷牙，进一步提升核心稳定性',
    match(trend, _isPeakToday, avgNeutralRatio) {
      if (trend !== 'stable') return 0
      if (avgNeutralRatio >= 0.6) return 10
      return 0
    },
  },
  {
    id: 'stable-high-2',
    condition: '趋势平稳 + 高基线（保持状态）',
    fortuneText:
      '姿势水准持续在线！评分 {score} 分稳居高位，{highlight}。你的尾巴已经很久没闹脾气了，继续保持 🎯',
    highlight: '高水准保持者',
    tip: '尝试在工作间隙做 2 分钟靠墙站立，精确校准',
    match(trend, _isPeakToday, avgNeutralRatio) {
      if (trend !== 'stable') return 0
      if (avgNeutralRatio >= 0.6) return 7
      return 0
    },
  },

  // ── 趋势平稳 + 低基线 ──
  {
    id: 'stable-low-1',
    condition: '趋势平稳 + 中立位偏低（需要改善）',
    fortuneText:
      '你的体态目前维持在较低水平，评分 {score} 分。{highlight}。虽然稳定，但还有很大的提升空间 🌅',
    highlight: '稳定但有待提升',
    tip: '先从调整椅子和桌子高度开始，打好基础',
    match(trend, _isPeakToday, avgNeutralRatio) {
      if (trend !== 'stable') return 0
      if (avgNeutralRatio < 0.3) return 10
      return 0
    },
  },

  // ── 通用备选 ──
  {
    id: 'generic-up',
    condition: '通用上升模板（无特定峰值匹配）',
    fortuneText:
      '尾巴运势 {score} 分，近 {day} 天体态呈上升趋势。{highlight}。每天进步一点点，积少成多就是大变化 ✨',
    highlight: '每天都在变好',
    tip: '保持运动的习惯，哪怕只是散步 20 分钟',
    match(trend) {
      if (trend !== 'up') return 0
      return 1
    },
  },
  {
    id: 'generic-down',
    condition: '通用下降模板（无特定场景匹配）',
    fortuneText:
      '尾巴运势 {score} 分，最近体态有些下滑。{highlight}。别忘了，你的身体一直在默默支撑你，给它一点关爱吧 🤲',
    highlight: '提醒关爱身体',
    tip: '试试瑜伽或普拉提，改善整体体态',
    match(trend) {
      if (trend !== 'down') return 0
      return 1
    },
  },
  {
    id: 'generic-stable',
    condition: '通用平稳模板（兜底）',
    fortuneText:
      '尾巴运势 {score} 分，近 {day} 天维持平稳。{highlight}。波澜不惊也是一种福气，享受当下的平衡吧 ☯️',
    highlight: '波澜不惊是福气',
    tip: '适时变换姿势，预防单一肌肉疲劳',
    match(_trend) {
      return 1 // 兜底，总是匹配
    },
  },
]

// ============================================================
// 辅助算法
// ============================================================

/**
 * 简单线性回归计算斜率。
 * 对 neutralRatio 序列做最小二乘拟合，返回斜率。
 *
 * @returns slope（每步变化量）和 trend 方向
 */
export function calcTrendSlope(values: number[]): {
  slope: number
  trend: 'up' | 'down' | 'stable'
} {
  const n = values.length

  if (n < 2) {
    return { slope: 0, trend: 'stable' }
  }

  // 标准化天数 [0, 1, 2, ..., n-1]
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0

  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }

  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) {
    return { slope: 0, trend: 'stable' }
  }

  const slope = (n * sumXY - sumX * sumY) / denominator

  // 阈值 ±0.02（实现计划 §39 规定）
  if (slope > 0.02) return { slope, trend: 'up' }
  if (slope < -0.02) return { slope, trend: 'down' }
  return { slope, trend: 'stable' }
}

/**
 * 计算综合体态评分 (0-100)。
 *
 * 公式：
 *   baseScore = avgNeutralRatio × 80
 *   bonus = min(avgStillnessPeak / 300, 1) × 20
 *   postureScore = clamp(baseScore + bonus, 0, 100)
 */
export function calcPostureScore(sessions: SessionSummary[]): number {
  const n = sessions.length
  if (n === 0) return 0

  let sumNeutralRatio = 0
  let sumStillnessPeak = 0

  for (const s of sessions) {
    sumNeutralRatio += s.neutralRatio
    sumStillnessPeak += s.stillnessPeak
  }

  const avgNeutralRatio = sumNeutralRatio / n
  const avgStillnessPeak = sumStillnessPeak / n

  const baseScore = avgNeutralRatio * 80
  const bonusRatio = Math.min(avgStillnessPeak / 300, 1)
  const bonus = bonusRatio * 20

  return Math.max(0, Math.min(100, Math.round(baseScore + bonus)))
}

/**
 * 从模板库中选择最匹配的模板。
 * 按匹配得分降序排列，返回最高分模板。
 */
function selectTemplate(
  trend: 'up' | 'down' | 'stable',
  isPeakToday: boolean,
  avgNeutralRatio: number,
  avgStillnessPeak: number,
): FortuneTemplate {
  let best: FortuneTemplate = TEMPLATES[TEMPLATES.length - 1] // 保底 generic-stable
  let bestScore = -1

  for (const tpl of TEMPLATES) {
    const score = tpl.match(trend, isPeakToday, avgNeutralRatio, avgStillnessPeak)
    if (score > bestScore) {
      bestScore = score
      best = tpl
    }
  }

  return best
}

// ============================================================
// FortuneService 实现
// ============================================================

export class FortuneService implements FortuneServiceInterface {
  // ---- 运势生成 ----

  generate(sessions: SessionSummary[]): DailyFortune {
    // 空数据 → 首次使用预告
    if (sessions.length === 0) {
      return this.generatePreviewFortune()
    }

    // 不足 3 天 → 数据不足提示
    if (sessions.length < 3) {
      return {
        date: todayDateString(),
        fortuneText: `才记录了 ${sessions.length} 天的数据，尾巴还没学会算命。再坚持两天，运势就会揭晓 🔮`,
        postureScore: calcPostureScore(sessions),
        highlight: '数据采集中',
        trend: 'stable',
        tip: '每天至少使用一次，积累数据解锁完整运势',
      }
    }

    // 提取每日 neutralRatio 序列（sessions 已按日期降序排列，需反转）
    const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
    const neutralRatios = sorted.map((s) => s.neutralRatio)

    // 计算趋势
    const { trend } = calcTrendSlope(neutralRatios)

    // 判断今天是否为峰值
    const todayNeutralRatio = neutralRatios[neutralRatios.length - 1]
    const isPeakToday = todayNeutralRatio >= Math.max(...neutralRatios)

    // 计算平均指标
    let sumNeutralRatio = 0
    let sumStillnessPeak = 0
    for (const s of sessions) {
      sumNeutralRatio += s.neutralRatio
      sumStillnessPeak += s.stillnessPeak
    }
    const avgNeutralRatio = sumNeutralRatio / sessions.length
    const avgStillnessPeak = sumStillnessPeak / sessions.length

    // 评分
    const postureScore = calcPostureScore(sessions)

    // 选模板
    const tpl = selectTemplate(trend, isPeakToday, avgNeutralRatio, avgStillnessPeak)

    // 填充占位符
    const fortuneText = tpl.fortuneText
      .replace(/\{highlight\}/g, tpl.highlight)
      .replace(/\{score\}/g, String(postureScore))
      .replace(/\{day\}/g, String(sessions.length))

    return {
      date: todayDateString(),
      fortuneText,
      postureScore,
      highlight: tpl.highlight,
      trend,
      tip: tpl.tip,
    }
  }

  // ---- 缓存操作 ----

  async getToday(): Promise<DailyFortune | null> {
    return getFortuneByDate(todayDateString())
  }

  async saveToday(fortune: DailyFortune): Promise<void> {
    await saveFortune(fortune)
  }

  // ---- 首次使用预告 ----

  generatePreviewFortune(): DailyFortune {
    return {
      date: todayDateString(),
      fortuneText:
        '明天这个时候，你的尾巴就能说话了。记得回来看看它想说什么。✨',
      postureScore: 0,
      highlight: '初次见面',
      trend: 'stable',
      tip: '明天开始追踪你的体态变化',
    }
  }
}

// ---- 模块级单例 ----

let instance: FortuneService | null = null

/** 获取 FortuneService 单例 */
export function getFortuneService(): FortuneService {
  if (!instance) {
    instance = new FortuneService()
  }
  return instance
}

/** 仅供测试使用：重置单例 */
export function resetFortuneService(): void {
  instance = null
}
