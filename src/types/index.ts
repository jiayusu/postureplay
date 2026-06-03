// ============================================================
// 体态游乐场 PosturePlay — 全局类型定义
// 基于 design-document.md §5.1 数据模型
// ============================================================

// ---- 基础类型 ----

/** 单个关键点（33 个 MediaPipe Pose 关键点之一） */
export interface Keypoint {
  x: number          // 归一化 [0, 1]
  y: number          // 归一化 [0, 1]
  z: number          // 深度，原点为臀部中心
  visibility: number  // [0, 1]
  name?: string      // 关键点名称（调试用）
}

/** 单帧完整体态指标 */
export interface PostureMetrics {
  timestamp: number
  spineAngle: number          // 脊柱垂直偏差（度），0 = 完全垂直
  shoulderLevelDiff: number   // 肩膀高度差（像素），0 = 水平
  headForwardAngle: number    // 头前倾角（度）
  pelvicTiltProxy: number     // 骨盆前后倾代理值
  breathMode: 'chest' | 'belly' | 'mixed'
  stillnessDuration: number   // 毫秒
  emotionalState: 'tense' | 'relaxed' | 'fatigued' | 'focused' | 'unknown'
  isNeutral: boolean          // 是否在中立位容差内
  confidence: number          // 整体置信度 [0, 1]
  // 相对校准基准的偏差（无 baseline 时为 0）
  spineAngleDeviation: number
  shoulderDiffDeviation: number
  headAngleDeviation: number
}

/** 中立位判定阈值 */
export interface NeutralThreshold {
  spineAngleMax: number     // 默认 8°
  shoulderDiffMax: number   // 默认 15px
  headAngleMax: number      // 默认 12°
}

// ---- 校准 ----

/** 校准数据 */
export interface CalibrationData {
  id: string
  baselineKeypoints: Keypoint[]
  createdAt: number
  duration: number
  confidence: number
}

// ---- 会话 ----

/** 会话摘要 */
export interface SessionSummary {
  id: string
  date: string              // ISO date string "2026-06-01"
  mode: AppMode
  startTime: number
  endTime: number
  duration: number          // 总时长（秒）
  neutralDuration: number   // 中立位累计时长（秒）
  neutralRatio: number      // 中立位占比 [0, 1]
  avgSpineAngle: number
  avgHeadAngle: number
  stillnessPeak: number     // 最长静止时长（秒）
  emotionalStateDistribution: Record<string, number>
}

/** 姿势快照（原始采样数据） */
export interface PostureSnapshot {
  sessionId: string
  timestamp: number         // 相对于 session 开始的时间偏移（ms）
  spineAngle: number
  shoulderLevelDiff: number
  headForwardAngle: number
  breathMode: string
  emotionalState: string
  isNeutral: boolean
}

// ---- 运势 ----

/** 每日运势 */
export interface DailyFortune {
  date: string
  fortuneText: string       // 运势正文文案（占卜风格）
  postureScore: number      // 0-100 综合评分
  highlight: string         // 亮点短句
  trend: 'up' | 'down' | 'stable'
  tip: string               // 体态建议
}

// ---- 模式 ----

/** 应用模式 */
export type AppMode = 'work' | 'casual' | 'meditation'

/** 可视化类型（MVP 仅 tail，预留扩展） */
export type VisualizationType = 'tail' | 'scale' | 'liquid_shoulder' | 'bubbles'

/** 模式配置 */
export interface ModeConfig {
  neutralThreshold: NeutralThreshold
  alertDelay: number        // 偏离后提醒延迟（秒）
  visualizationStyle: 'full' | 'simple' | 'minimal'
  showBubbles: boolean
  showJudgment: boolean     // 是否显示对错反馈
  performanceTarget: {
    minRenderFPS: number
    minPoseFPS: number
    degradeDelay: number    // 降级触发连续秒数
    maxDegradeLevel: DegradationLevel
  }
}

// ---- 设置 ----

/** 全局应用设置 */
export interface AppSettings {
  theme: 'dark'
  cameraFacing: 'user' | 'environment'
  language: 'zh-CN'
  onboardingCompleted: boolean
  firstVisitDate: string
  visitCount: number
}

// ---- 相机 ----

/** 摄像头配置 */
export interface CameraConfig {
  facingMode: 'user' | 'environment'
  width: number
  height: number
}

/** 摄像头错误类型 */
export type CameraErrorType =
  | 'not_supported'
  | 'permission_denied'
  | 'not_found'
  | 'not_readable'
  | 'in_use'
  | 'generic'

// ---- 可视化 ----

/** 尾巴单段 */
export interface TailSegment {
  x: number
  y: number
  angle: number
  length: number
  color: string
}

/** 尾巴整体状态 */
export interface TailState {
  segments: TailSegment[]
  basePosition: { x: number; y: number }
  stiffness: number         // [0, 0.8]
  tailLength: number
  petrification: number     // [0, 1] 石化程度
}

/** 尾巴模式 */
export type TailMode = 'normal' | 'petrified' | 'floating'

/** 粒子 */
export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  life: number
  alpha: number
}

// ---- 性能 ----

/** 降级等级 */
export type DegradationLevel = 'none' | 'level1' | 'level2' | 'level3'

/** 性能指标 */
export interface PerformanceMetrics {
  poseFPS: number
  renderFPS: number
  frameDropRate: number
  modelLoadTime: number
  avgInferenceTime: number
  heapUsedMB: number | null
  heapUsagePercent: number | null
  degradationLevel: DegradationLevel
}

// ---- 手部 / 手相健康 ----

export type {
  HandKeypoint,
  Handedness,
  PalmColorMetrics,
  FingerMetrics,
  DigitRatio,
  TremorMetrics,
  PalmLineInfo,
  HandHealthMetrics,
  CombinedHandMetrics,
} from './hand'
