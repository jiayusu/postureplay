// ============================================================
// 体态游乐场 PosturePlay — 手部/掌纹健康类型定义
// 基于 MediaPipe Hand Landmarker（21 个手部关键点）
// ============================================================

/** 手部关键点（归一化坐标） */
export interface HandKeypoint {
  x: number          // 归一化 [0, 1]
  y: number          // 归一化 [0, 1]
  z: number          // 深度
  visibility: number // [0, 1]
}

/** 手性 */
export type Handedness = 'Left' | 'Right'

/** 手掌颜色分析结果 */
export interface PalmColorMetrics {
  /** 平均红色分量 [0, 1] */
  meanRed: number
  /** 平均绿色分量 [0, 1] */
  meanGreen: number
  /** 平均蓝色分量 [0, 1] */
  meanBlue: number
  /** 计算的红润度 [0, 1] */
  redness: number
  /** 颜色分类 */
  colorCategory: 'normal' | 'pale' | 'flushed' | 'cyanotic' | 'jaundiced'
  /** 置信度 */
  confidence: number
}

/** 手指指标 */
export interface FingerMetrics {
  /** 手指名称 */
  name: string
  /** 手指长度（归一化坐标下的像素距离） */
  length: number
  /** 指关节弯曲角度（近端指间关节，度） */
  flexionAngle: number
  /** 指尖位移（相对手腕，当前帧变化） */
  tipDisplacement: number
  /** 指尖置信度 */
  tipConfidence: number
}

/** 2D:4D 比值分析 */
export interface DigitRatio {
  /** 食指长度（2D） */
  indexLength: number
  /** 无名指长度（4D） */
  ringLength: number
  /** 2D:4D 比值 */
  ratio: number
  /** 分类 */
  category: 'low' | 'normal' | 'high'
  /** 健康解读 */
  healthInterpretation: string
}

/** 手部震颤分析 */
export interface TremorMetrics {
  /** 指尖震颤幅度（归一化坐标） */
  amplitude: number
  /** 震颤主频率（Hz） */
  dominantFrequency: number
  /** 震颤分类 */
  category: 'none' | 'physiological' | 'enhanced_physiological' | 'abnormal'
  /** 是否提示病理性震颤 */
  isAbnormal: boolean
  /** 置信度 */
  confidence: number
}

/** 掌纹线信息 */
export interface PalmLineInfo {
  /** 线的名称 */
  name: 'life_line' | 'heart_line' | 'head_line' | 'fate_line'
  /** 线段的起点（归一化坐标） */
  startPoint: { x: number; y: number }
  /** 线段的终点（归一化坐标） */
  endPoint: { x: number; y: number }
  /** 线长（归一化坐标） */
  length: number
  /** 清晰度评分 [0, 1] */
  clarity: number
  /** 连续性评分 [0, 1] */
  continuity: number
  /** 深度评分 [0, 1] */
  depth: number
  /** 是否被检测到 */
  detected: boolean
}

/** 单只手完整健康指标 */
export interface HandHealthMetrics {
  /** 时间戳 */
  timestamp: number
  /** 手性 */
  handedness: Handedness
  /** 手部置信度 */
  confidence: number
  /** 手指指标数组（5根手指） */
  fingers: FingerMetrics[]
  /** 2D:4D 比值分析 */
  digitRatio: DigitRatio
  /** 手掌颜色分析 */
  palmColor: PalmColorMetrics
  /** 手部震颤分析 */
  tremor: TremorMetrics
  /** 掌纹线信息 */
  palmLines: PalmLineInfo[]
  /** 甲床颜色（基于指尖ROI采样） */
  nailBedColor: PalmColorMetrics | null
  /** 手部整体健康评分 [0, 100] */
  healthScore: number
  /** 健康总结 */
  healthSummary: string
  /** 建议列表 */
  recommendations: string[]
}

/** 双手综合健康指标 */
export interface CombinedHandMetrics {
  /** 时间戳 */
  timestamp: number
  /** 左手指标 */
  leftHand: HandHealthMetrics | null
  /** 右手指标 */
  rightHand: HandHealthMetrics | null
  /** 双手对称性评分 [0, 1] */
  symmetryScore: number
  /** 综合健康评分 [0, 100] */
  overallHealthScore: number
  /** 综合健康总结 */
  overallSummary: string
  /** 综合建议 */
  combinedRecommendations: string[]
}
