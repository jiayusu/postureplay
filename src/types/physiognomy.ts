/**
 * 相术体态分析类型定义
 * 涵盖脊柱分析（生命之树）、手相分析（掌中星辰）、骨相分析（面相透射）
 */

// ─── 脊柱分析类型 ───

/** 脊柱段角度 */
export interface SpineSegment {
  /** 角度（度），0=完全直立 */
  angle: number
  /** 偏离程度 0=理想, 1=严重偏离 */
  deviation: number
  /** 段标签 */
  label: 'cervical' | 'thoracic' | 'lumbar'
}

/** 脊柱完整指标 */
export interface SpineMetrics {
  timestamp: number
  /** 颈椎段（头部前倾） */
  cervical: SpineSegment
  /** 胸椎段（含胸驼背） */
  thoracic: SpineSegment
  /** 腰椎段（骨盆前倾/后倾） */
  lumbar: SpineSegment
  /** 左右肩高不对称 (正=右肩高) */
  shoulderAsymmetry: number
  /** 侧弯程度 0-1 */
  lateralCurvature: number
  /** 整体脊柱健康评分 0-100 */
  overallScore: number
  /** 脊柱关键点（用于可视化） */
  spineLine: Array<{ x: number; y: number; z?: number }>
}

/** 脊柱能量状态 */
export interface SpineEnergy {
  /** 能量等级 0-1 */
  level: number
  /** 状态描述 */
  state: 'flowing' | 'blocked' | 'diminished'
  /** 堵塞位置 */
  blockedAt?: 'cervical' | 'thoracic' | 'lumbar'
}

// ─── 手相分析类型 ───

/** 手掌九宫格区域 */
export type BaguaSector =
  | 'qian'  // 乾 - 西北/右下
  | 'kan'   // 坎 - 北/下
  | 'gen'   // 艮 - 东北/左下
  | 'zhen'  // 震 - 东/左
  | 'xun'   // 巽 - 东南/左上
  | 'li'    // 离 - 南/上
  | 'kun'   // 坤 - 西南/右上
  | 'dui'   // 兑 - 西/右

/** 手掌区域指标 */
export interface PalmRegion {
  /** 区域中心归一化坐标 */
  center: { x: number; y: number }
  /** 八卦宫位 */
  sector: BaguaSector | 'center'
  /** 对应脏腑 */
  organ: string
  /** 能量评分 0-100 */
  energyScore: number
  /** 颜色倾向 */
  colorHint: 'ruddy' | 'pale' | 'dark' | 'normal'
  /** 区域边界 (4个角的归一化坐标) */
  bounds: [number, number, number, number] // [x, y, w, h]
}

/** 手掌线条类型 */
export interface PalmLine {
  /** 线条名称 */
  name: 'life' | 'head' | 'heart' | 'fate'
  /** 线条质量 0-1 */
  quality: number
  /** 是否完整连续 */
  isContinuous: boolean
  /** 关键节点坐标 */
  nodes: Array<{ x: number; y: number }>
  /** 能量粒子颜色 */
  particleColor: string
}

/** 掌中星辰完整指标 */
export interface PalmStarsMetrics {
  timestamp: number
  /** 左手还是右手 */
  hand: 'left' | 'right'
  /** 九宫格区域 */
  regions: PalmRegion[]
  /** 生命线 */
  lifeLine: PalmLine
  /** 智慧线 */
  headLine: PalmLine
  /** 感情线 */
  heartLine: PalmLine
  /** 命运线 */
  fateLine: PalmLine
  /** 金星丘（大鱼际）饱满度 0-1 */
  venusMountFullness: number
  /** 整体掌色评分 */
  overallPalmColor: 'ruddy' | 'pale' | 'dark' | 'normal'
  /** 手掌元气评分 0-100 */
  vitalityScore: number
}

// ─── 骨相分析类型 ───

/** 骨相区域 */
export interface BoneRegion {
  /** 区域名称 */
  name: 'forehead' | 'cheekboneLeft' | 'cheekboneRight' | 'jaw' | 'noseBridge' | 'chin'
  /** 突出度/饱满度 0-1 */
  prominence: number
  /** 轮廓关键点 */
  contour: Array<{ x: number; y: number; z?: number }>
  /** 相术判定 */
  judgment: 'auspicious' | 'neutral' | 'controversial' | 'warning'
  /** 判定描述 */
  judgmentLabel: string
}

/** 骨相完整指标 */
export interface BonePhysiognomyMetrics {
  timestamp: number
  /** 各骨骼区域 */
  regions: BoneRegion[]
  /** 额骨饱满度 */
  foreheadFullness: number
  /** 颧骨突出度 */
  cheekboneProminence: number
  /** 下颌角度（度） */
  jawAngle: number
  /** 鼻骨直挺度 */
  noseBridgeStraightness: number
  /** 整体面相评分 0-100 */
  overallScore: number
  /** 面型判定 */
  faceShape: 'round' | 'square' | 'oval' | 'diamond' | 'triangle'
}

// ─── 运势解读类型 ───

/** 运势解读 */
export interface FortuneInterpretation {
  /** 脊柱运势 */
  spine: {
    summary: string
    detail: string
    advice: string
  }
  /** 手相运势 */
  palm: {
    summary: string
    detail: string
    advice: string
  }
  /** 骨相运势 */
  bone: {
    summary: string
    detail: string
    advice: string
  }
  /** 综合运势 */
  overall: {
    score: number
    summary: string
    luckyElement: string
    luckyColor: string
  }
  /** 生成时间 */
  generatedAt: number
}

// ─── 可视化特效类型 ───

/** 树节点（生命之树） */
export interface TreeNode {
  /** 归一化位置 */
  pos: { x: number; y: number }
  /** 节点标签 */
  label: string
  /** 对应脊柱段 */
  segment: 'cervical' | 'thoracic' | 'lumbar'
  /** 节气花类型 */
  flowerType: 'plum' | 'orchid' | 'bamboo' | 'chrysanthemum' | 'lotus'
  /** 花朵盛开程度 0-1 */
  bloomLevel: number
  /** 能量颜色 */
  glowColor: string
  /** 脉动相位 */
  pulsePhase: number
}

/** 能量粒子 */
export interface EnergyParticle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

/** 八卦光环状态 */
export interface BaguaHalo {
  rotation: number
  opacity: number
  radius: number
  segments: Array<{
    sector: string
    color: string
    active: boolean
    intensity: number
  }>
}
