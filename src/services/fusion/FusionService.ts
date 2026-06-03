/**
 * FusionService — 体态+眼态+手部融合服务
 *
 * 将 PostureMetrics、EyeStateMetrics 和 HandHealthMetrics 综合分析，
 * 生成面向用户的可操作反馈。
 */

import type { PostureMetrics } from '@/types'
import type { EyeStateMetrics, FusionFeedback } from '@/types/eye'
import type { CombinedHandMetrics } from '@/types/hand'
import type { FusionServiceInterface } from './types'

// ── 融合规则表 ──

interface FusionRule {
  condition: (p: PostureMetrics | null, e: EyeStateMetrics | null, h: CombinedHandMetrics | null) => boolean
  feedback: Omit<FusionFeedback, 'triggers'>
  triggers: string[]
}

const rules: FusionRule[] = [
  // ── ALERT 级别 ──
  {
    condition: (p, e) => !!p && !!e &&
      p.headForwardAngle > 15 &&
      e.blinkRate < 10 &&
      e.fatigueScore > 60,
    triggers: ['头前倾角度过大', '眨眼频率极低', '眼疲劳评分高'],
    feedback: {
      level: 'alert',
      title: '屏幕距离太近，眼睛在求救！',
      description: '你离屏幕太近了，眨眼次数只有正常的 1/3，眼睛和脖子都在承受压力。',
      suggestedAction: '后靠椅背，使用 20-20-20 法则：每 20 分钟看 20 英尺以外 20 秒。',
      relatedPostureMetric: 'headForwardAngle',
      relatedEyeMetric: 'blinkRate',
    },
  },
  {
    condition: (p, e) => !!p && !!e &&
      (p.breathMode === 'chest' || p.emotionalState === 'tense') &&
      (e.leftEye.isBlinking || e.rightEye.isBlinking) &&
      (e.leftEye.blinkDuration > 30 || e.rightEye.blinkDuration > 30),
    triggers: ['长时间闭眼', '体态紧张'],
    feedback: {
      level: 'alert',
      title: '你眼皮在打架了...',
      description: '检测到长时间闭眼，结合含胸紧张体态，你可能快睡着了或极度疲劳。',
      suggestedAction: '站起来拉伸 2 分钟，或做 10 次深呼吸重新唤醒身体。',
      relatedPostureMetric: 'emotionalState',
      relatedEyeMetric: 'blinkDuration',
    },
  },

  // ── INFO: 手部异常震颤 ──
  {
    condition: (_p, _e, h) => {
      if (!h) return false
      return !!h.leftHand?.tremor?.isAbnormal || !!h.rightHand?.tremor?.isAbnormal
    },
    triggers: ['手部震颤异常'],
    feedback: {
      level: 'alert',
      title: '手部异常震颤检测！',
      description: '检测到单侧或双侧手部震颤超出正常生理范围。可能与疲劳、紧张或神经系统有关。',
      suggestedAction: '深呼吸放松手臂，如持续存在建议咨询医生进行神经系统评估。',
      relatedEyeMetric: 'blinkRate',
    },
  },
  {
    condition: (_p, _e, h) => {
      if (!h) return false
      return (!!h.leftHand?.palmColor?.colorCategory && h.leftHand.palmColor.colorCategory === 'pale' && !!h.rightHand?.palmColor?.colorCategory && h.rightHand.palmColor.colorCategory === 'pale') ||
        (!!h.leftHand?.palmColor?.colorCategory && h.leftHand.palmColor.colorCategory === 'cyanotic') ||
        (!!h.rightHand?.palmColor?.colorCategory && h.rightHand.palmColor.colorCategory === 'cyanotic')
    },
    triggers: ['手掌颜色异常'],
    feedback: {
      level: 'alert',
      title: '手掌颜色异常 — 注意血液循环',
      description: '检测到手掌颜色偏白或偏紫，可能提示末梢循环不良或贫血倾向。',
      suggestedAction: '活动手指促进血液循环，如长期存在请检查血常规和心血管健康。',
      relatedEyeMetric: 'blinkRate',
    },
  },

  // ── WARNING 级别 ──
  {
    condition: (p, e) => !!p && !!e &&
      Math.abs(p.spineAngle) > 15 &&
      e.gaze.isLookingAtScreen &&
      e.fatigueScore > 40,
    triggers: ['脊柱偏移大', '注视屏幕固定过久'],
    feedback: {
      level: 'warning',
      title: '你一直在盯着同一个地方...',
      description: '身体歪斜且注视方向几乎不动，可能进入了"沉浸式塌陷"状态。',
      suggestedAction: '换个姿势，向远处天花板或窗外看一眼，转动脖子做 3 次环绕。',
      relatedPostureMetric: 'spineAngle',
      relatedEyeMetric: 'gaze',
    },
  },

  // ── 手部 + 姿势 WARNING ──
  {
    condition: (p, _e, h) => {
      if (!p || !h) return false
      return p.emotionalState === 'tense' &&
        (!!(h.leftHand?.tremor?.category === 'enhanced_physiological') ||
         !!(h.rightHand?.tremor?.category === 'enhanced_physiological'))
    },
    triggers: ['体态紧张', '手部增强性震颤'],
    feedback: {
      level: 'warning',
      title: '紧张体态 + 手部微颤 — 你太紧绷了',
      description: '身体处于紧张状态，同时手部有增强性微颤，可能是压力或咖啡因摄入过多。',
      suggestedAction: '尝试腹式深呼吸 2 分钟，减少咖啡因摄入，做手腕放松运动。',
      relatedPostureMetric: 'emotionalState',
      relatedEyeMetric: 'blinkRate',
    },
  },
  {
    condition: (_p, _e, h) => !!h &&
      h.symmetryScore < 0.55 &&
      !!h.leftHand && !!h.rightHand,
    triggers: ['双手对称性低'],
    feedback: {
      level: 'warning',
      title: '双手使用不均衡',
      description: '左右手活动和形态存在较大差异，可能提示习惯性单侧过度使用。',
      suggestedAction: '注意交替使用双手，增加非惯用手的使用频率，保持双侧均衡。',
      relatedEyeMetric: 'blinkRate',
    },
  },
  {
    condition: (_p, e) => !!e && e.blinkRate < 8 && e.fatigueScore > 50,
    triggers: ['眨眼频率极低', '眼疲劳'],
    feedback: {
      level: 'warning',
      title: '眨眼太少，眼睛在变干！',
      description: '正常每分钟应眨眼 15-20 次，你目前远低于这个水平。',
      suggestedAction: '有意识地多眨几次眼，或使用人工泪液。每半小时让眼睛休息一下。',
      relatedEyeMetric: 'blinkRate',
    },
  },
  {
    condition: (_p, e) => !!e && e.estimatedScreenDistance < 0.8,
    triggers: ['屏幕距离过近'],
    feedback: {
      level: 'warning',
      title: '你离屏幕太近了！',
      description: '面部在画面中偏大，表明头部离屏幕距离过近，会加剧近视风险。',
      suggestedAction: '保持一臂距离（约 50-70cm），将屏幕后推或身体后靠。',
      relatedEyeMetric: 'estimatedScreenDistance',
    },
  },

  // ── INFO 级别 ──
  {
    condition: (p, e) => !!p && !!e &&
      p.stillnessDuration > 300_000 &&
      e.gaze.isLookingAtScreen,
    triggers: ['长时间静止', '注视屏幕'],
    feedback: {
      level: 'info',
      title: '坐得太久了，眼睛也需要休息',
      description: '你已经保持同一姿势超过 5 分钟，持续盯着屏幕。',
      suggestedAction: '站起来活动 1 分钟，朝远处眺望让睫状肌放松。',
      relatedPostureMetric: 'stillnessDuration',
      relatedEyeMetric: 'gaze',
    },
  },

  // ── 手部 INFO ──
  {
    condition: (_p, _e, h) => !!h && h.overallHealthScore < 70 && h.overallHealthScore >= 50,
    triggers: ['手部健康评分偏低'],
    feedback: {
      level: 'info',
      title: '手部健康可以改善',
      description: '手部健康综合评分偏低，建议关注手指活动和手部保养。',
      suggestedAction: '每天做手指操，定期活动手腕关节，注意手部保暖。',
      relatedEyeMetric: 'blinkRate',
    },
  },
  {
    condition: (_p, e) => !!e && e.fatigueScore > 40 && e.fatigueScore <= 60,
    triggers: ['眼疲劳中度'],
    feedback: {
      level: 'info',
      title: '眼睛开始有点累了',
      description: '眼疲劳评分偏高，注意用眼卫生。',
      suggestedAction: '尝试远眺 20 秒，有意识地多眨眼。',
      relatedEyeMetric: 'fatigueScore',
    },
  },
]

export class FusionService implements FusionServiceInterface {
  private lastFeedback: FusionFeedback | null = null
  private feedbackCooldowns: Map<string, number> = new Map()
  private readonly cooldownMs = 15_000 // 同一规则冷却 15 秒

  fuse(posture: PostureMetrics | null, eye: EyeStateMetrics | null, hand: CombinedHandMetrics | null = null): FusionFeedback {
    // 如果没有眼态数据且没有手部数据，返回空反馈
    if ((!eye || eye.confidence < 0.4) && !hand) {
      return {
        level: 'none',
        title: '',
        description: '',
        suggestedAction: '',
        triggers: [],
      }
    }

    // 按优先级排序（alert > warning > info）
    const levelOrder: Record<string, number> = { alert: 0, warning: 1, info: 2 }

    let bestMatch: FusionRule | null = null
    let bestLevel = 999

    for (const rule of rules) {
      if (rule.condition(posture, eye, hand)) {
        const lvl = levelOrder[rule.feedback.level] ?? 99
        if (lvl < bestLevel) {
          // 检查冷却
          const lastTriggered = this.feedbackCooldowns.get(rule.feedback.title)
          if (lastTriggered && Date.now() - lastTriggered < this.cooldownMs) {
            continue
          }
          bestLevel = lvl
          bestMatch = rule
        }
      }
    }

    if (!bestMatch) {
      // 所有正常，返回空
      const result: FusionFeedback = {
        level: 'none',
        title: '',
        description: '',
        suggestedAction: '',
        triggers: [],
      }
      this.lastFeedback = result
      return result
    }

    // 记录冷却
    this.feedbackCooldowns.set(bestMatch.feedback.title, Date.now())

    const result: FusionFeedback = {
      ...bestMatch.feedback,
      triggers: bestMatch.triggers,
    }
    this.lastFeedback = result
    return result
  }

  getLastFeedback(): FusionFeedback | null {
    return this.lastFeedback
  }
}

// ---- 单例 ----

let fusionInstance: FusionService | null = null

export function getFusionService(): FusionService {
  if (!fusionInstance) {
    fusionInstance = new FusionService()
  }
  return fusionInstance
}
