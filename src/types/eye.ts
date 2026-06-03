// ============================================================
// 体态游乐场 PosturePlay — 人眼状态类型定义
// 基于 MediaPipe Face Landmarker（478 个关键点）
// ============================================================

/** 面部关键点（归一化坐标，与 Keypoint 接口兼容） */
export interface FaceKeypoint {
  x: number          // 归一化 [0, 1]
  y: number          // 归一化 [0, 1]
  z: number          // 深度
  visibility: number  // [0, 1]，实际来自 Face Landmarker 的 presence
}

/** MediaPipe Face Landmarker 中与眼部相关的关键点索引 */
export const EYE_LANDMARK_INDICES = {
  // 左眼轮廓（按顺时针排列，用于 EAR 计算）
  leftEye: {
    top: 159,           // 上眼睑顶部
    bottom: 145,        // 下眼睑底部
    inner: 133,         // 内眼角
    outer: 33,          // 外眼角
    upper1: 158,        // 上眼睑内上
    upper2: 160,        // 上眼睑外上
    lower1: 144,        // 下眼睑内下
    lower2: 153,        // 下眼睑外下
  },
  // 右眼轮廓
  rightEye: {
    top: 386,           // 上眼睑顶部
    bottom: 374,        // 下眼睑底部
    inner: 362,         // 内眼角
    outer: 263,         // 外眼角
    upper1: 385,        // 上眼睑内上
    upper2: 387,        // 上眼睑外上
    lower1: 373,        // 下眼睑内下
    lower2: 380,        // 下眼睑外下
  },
  // 虹膜中心
  iris: {
    left: 468,          // 左虹膜中心
    right: 473,         // 右虹膜中心
  },
  // 鼻梁（用于注视方向参考）
  noseBridge: 168,
  // 鼻尖
  noseTip: 1,
} as const

/** 单只眼睛的 EAR 分量 */
export interface EyeEAR {
  /** Eye Aspect Ratio（眼高宽比），正常约 0.3-0.4，闭眼时 < 0.18 */
  ear: number
  /** 眨眼次数（累计） */
  blinkCount: number
  /** 当前是否处于闭眼状态 */
  isBlinking: boolean
  /** 闭眼持续时间（帧数） */
  blinkDuration: number
}

/** 注视方向估算 */
export interface GazeDirection {
  /** 水平偏移 [-1, 1]，0 为正视，负为左，正为右 */
  horizontal: number
  /** 垂直偏移 [-1, 1]，0 为正视，负为上，正为下 */
  vertical: number
  /** 是否注视屏幕（偏移量在阈值内） */
  isLookingAtScreen: boolean
}

/** 单帧完整人眼状态指标 */
export interface EyeStateMetrics {
  timestamp: number
  /** 左眼 EAR */
  leftEye: EyeEAR
  /** 右眼 EAR */
  rightEye: EyeEAR
  /** 综合眨眼频率（次/分钟） */
  blinkRate: number
  /** 注视方向 */
  gaze: GazeDirection
  /** 眼疲劳评分 [0, 100]，越高越疲劳 */
  fatigueScore: number
  /** 屏幕距离估计（基于人脸大小的相对值，非物理距离） */
  estimatedScreenDistance: number
  /** 面部整体置信度 */
  confidence: number
  /** 面部关键点数量（478 表示完整检测） */
  faceLandmarkCount: number
}

/** 眼疲劳影响因素 */
export interface FatigueFactors {
  /** 眨眼频率偏低（<12/min 表明盯屏过度） */
  lowBlinkRate: number       // [0, 1] 严重程度
  /** 眼睑开度持续偏低（眼睑下垂） */
  eyelidDroop: number        // [0, 1]
  /** 注视固定时间过长 */
  gazeFixation: number       // [0, 1]
  /** 屏幕距离过近 */
  tooClose: number           // [0, 1]
}

/** 体态+眼态融合反馈 */
export interface FusionFeedback {
  /** 反馈级别 */
  level: 'none' | 'info' | 'warning' | 'alert'
  /** 反馈标题 */
  title: string
  /** 反馈描述 */
  description: string
  /** 建议动作 */
  suggestedAction: string
  /** 触发原因组合 */
  triggers: string[]
  /** 关联的体态指标 */
  relatedPostureMetric?: string
  /** 关联的眼态指标 */
  relatedEyeMetric?: string
}
