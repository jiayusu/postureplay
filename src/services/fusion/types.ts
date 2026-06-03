/**
 * FusionService 接口定义
 */

import type { PostureMetrics } from '@/types'
import type { EyeStateMetrics, FusionFeedback } from '@/types/eye'
import type { CombinedHandMetrics } from '@/types/hand'

export interface FusionServiceInterface {
  /** 综合体态 + 眼态 + 手部，生成融合反馈 */
  fuse(
    posture: PostureMetrics | null,
    eye: EyeStateMetrics | null,
    hand?: CombinedHandMetrics | null,
  ): FusionFeedback

  /** 获取最近一次融合反馈 */
  getLastFeedback(): FusionFeedback | null
}
