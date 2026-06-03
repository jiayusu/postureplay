/**
 * 可视化物理模型 — 纯函数集合
 *
 * 包含尾骨锚点计算、重力偏移、刚度映射、
 * 尾巴段物理模拟、石化/漂浮判定、颜色计算、粒子系统。
 */

import type { Keypoint, PostureMetrics, TailSegment, Particle } from '@/types'
import {
  BODY_JOINTS,
  TAILBONE_ANCHOR_INDICES,
} from '@/constants/keypoints'
import {
  TAIL_SEGMENT_COUNT,
  TAIL_DEFAULT_LENGTH,
  PETRIFICATION_THRESHOLD,
  FLOATING_THRESHOLD,
} from '@/constants/config'

// ---- 常量 ----

/** 尾桩在髋中心下方的偏移像素 */
const TAIL_ANCHOR_Y_OFFSET = 30

/** 重力偏移系数 */
const GRAVITY_SHIFT_COEFF = 25

/** 抖动幅度（弧度） */
const JITTER_AMPLITUDE = 0.05

/** 失重漂浮随机偏移范围 */
const FLOATING_DRIFT_RANGE = 3

/** 每帧发射粒子数 */
const PARTICLES_PER_FRAME = 2

/** 粒子初始生命范围 */
const PARTICLE_LIFE_MIN = 30
const PARTICLE_LIFE_MAX = 60

/** 粒子初始大小范围 */
const PARTICLE_SIZE_MIN = 1
const PARTICLE_SIZE_MAX = 4

/** 粒子速度范围 */
const PARTICLE_SPEED_MIN = -2
const PARTICLE_SPEED_MAX = 2

// ---- 步骤 28：锚点、重力、刚度 ----

/**
 * 计算尾骨锚点在 Canvas 上的像素坐标
 *
 * 取左右髋中点 → 归一化转像素 → Y 轴下移 30px
 */
export function computeBasePosition(
  keypoints: Keypoint[],
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const leftHip = keypoints[TAILBONE_ANCHOR_INDICES.leftHip]
  const rightHip = keypoints[TAILBONE_ANCHOR_INDICES.rightHip]

  if (!leftHip || !rightHip) {
    return { x: canvasWidth / 2, y: canvasHeight / 2 + TAIL_ANCHOR_Y_OFFSET }
  }

  // 将归一化坐标转为像素坐标，X 轴翻转以匹配 CSS 镜像视频
  const cx = canvasWidth - ((leftHip.x + rightHip.x) / 2) * canvasWidth
  const cy = ((leftHip.y + rightHip.y) / 2) * canvasHeight + TAIL_ANCHOR_Y_OFFSET

  return { x: cx, y: cy }
}

/**
 * 基于肩膀高度差计算重力偏移量
 */
export function computeGravityShift(shoulderLevelDiff: number): number {
  return shoulderLevelDiff * GRAVITY_SHIFT_COEFF
}

/**
 * 基于脊柱角映射刚度到 [0, 0.8]
 *
 * spineAngle 越大 → 越驼/越歪 → stiffness 越大
 */
export function computeStiffness(spineAngle: number): number {
  return Math.min(Math.abs(spineAngle) / 45, 1) * 0.8
}

// ---- 步骤 29：尾巴段物理模拟 ----

/**
 * 更新尾巴段位置（简化的 Verlet 链模型）
 *
 * 第 0 段从锚点出发，每段方向 = 上一段方向 + 脊柱倾斜 + 重力偏移 + 微小抖动。
 * 刚度越大运动阻尼越大（角度变化 × (1-stiffness)）。
 */
export function updateTailSegments(
  segments: TailSegment[],
  basePosition: { x: number; y: number },
  metrics: PostureMetrics,
  previousSegments: TailSegment[] | null,
): TailSegment[] {
  const segmentLength = TAIL_DEFAULT_LENGTH / TAIL_SEGMENT_COUNT
  const gravityShift = computeGravityShift(metrics.shoulderLevelDiff)
  const stiffness = computeStiffness(metrics.spineAngle)

  // 基础方向：垂直向下（Math.PI / 2 = 向下），脊柱倾斜使其偏移
  const baseAngle = Math.PI / 2 + (metrics.spineAngle * Math.PI) / 180

  const newSegments: TailSegment[] = []

  for (let i = 0; i < TAIL_SEGMENT_COUNT; i++) {
    // 起点：第 0 段为 basePosition，后续为前一段末端
    const startX = i === 0 ? basePosition.x : newSegments[i - 1].x
    const startY = i === 0 ? basePosition.y : newSegments[i - 1].y

    // 角度 = 基础方向 + 重力偏移 + 随机抖动
    const gravityFactor = (i + 1) * 0.03 * gravityShift
    const jitter = (Math.random() - 0.5) * 2 * JITTER_AMPLITUDE
    let targetAngle = baseAngle + gravityFactor + jitter

    // 阻尼：如果上一帧有数据，角度向上一帧平滑过渡
    if (previousSegments && previousSegments[i]) {
      const prevAngle = previousSegments[i].angle
      const dampFactor = 1 - stiffness
      targetAngle = prevAngle + (targetAngle - prevAngle) * dampFactor
    }

    // 计算方向向量和末端位置
    const dx = Math.cos(targetAngle) * segmentLength
    const dy = Math.sin(targetAngle) * segmentLength

    newSegments.push({
      x: startX + dx,
      y: startY + dy,
      angle: targetAngle,
      length: segmentLength,
      color: '', // 颜色由 getTailColor 统一填充
    })
  }

  return newSegments
}

/**
 * 计算石化程度 [0, 1]
 *
 * stillnessDuration 单位：毫秒。PETRIFICATION_THRESHOLD 单位：秒。
 */
export function updatePetrification(stillnessDuration: number): number {
  const thresholdMs = PETRIFICATION_THRESHOLD * 1000
  return Math.min(stillnessDuration / thresholdMs, 1)
}

/**
 * 是否触发失重漂浮
 *
 * FLOATING_THRESHOLD 单位：秒。
 */
export function updateFloating(stillnessDuration: number): boolean {
  const thresholdMs = FLOATING_THRESHOLD * 1000
  return stillnessDuration > thresholdMs
}

/**
 * 获取尾巴颜色（随石化程度渐变）
 *
 * petrification 0 → 暖橙色
 * petrification 1 → 灰色
 * emotionalState 微调色温
 */
export function getTailColor(
  petrification: number,
  emotionalState: PostureMetrics['emotionalState'],
): string {
  // 基础色 (暖橙 → 灰)
  const r = Math.round(255 - petrification * 127)
  const g = Math.round(180 - petrification * 100)
  const b = Math.round(120 - petrification * 60)

  // 情绪色温微调
  let tr = 0, tg = 0, tb = 0
  switch (emotionalState) {
    case 'tense':
      tr = 20; tg = -10; tb = 20   // 冷紫蓝
      break
    case 'relaxed':
      tr = 20; tg = 10; tb = -10   // 暖金
      break
    case 'fatigued':
      tr = -20; tg = -20; tb = -10 // 灰暗
      break
    case 'focused':
    case 'unknown':
    default:
      break
  }

  const alpha = 0.6 + (1 - petrification) * 0.3 // 石化越深越透明

  return `rgba(${clamp(r + tr)}, ${clamp(g + tg)}, ${clamp(b + tb)}, ${alpha.toFixed(2)})`
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v))
}

// ---- 失重漂浮偏移 ----

/**
 * 失重漂浮模式下生成段偏移
 *
 * 每段随机小幅漂移，幅度受帧计数调制
 */
export function computeFloatingOffset(
  segmentIndex: number,
  frameCount: number,
): { dx: number; dy: number } {
  // 使用 segmentIndex + frameCount 做伪随机种子
  const seed = (segmentIndex * 7 + frameCount * 13) % 100
  const angle = (seed / 100) * Math.PI * 2
  const magnitude = FLOATING_DRIFT_RANGE * (1 + segmentIndex * 0.3)
  return {
    dx: Math.cos(angle) * magnitude,
    dy: Math.sin(angle) * magnitude,
  }
}

// ---- 步骤 30：粒子系统 ----

/**
 * 在尾巴尖端生成新粒子
 */
export function emitParticles(
  tailTip: { x: number; y: number },
  tailColor: string,
  count: number = PARTICLES_PER_FRAME,
): Particle[] {
  const particles: Particle[] = []

  for (let i = 0; i < count; i++) {
    const life = PARTICLE_LIFE_MIN + Math.random() * (PARTICLE_LIFE_MAX - PARTICLE_LIFE_MIN)
    particles.push({
      x: tailTip.x,
      y: tailTip.y,
      vx: PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN),
      vy: PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN),
      size: PARTICLE_SIZE_MIN + Math.random() * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN),
      color: tailColor,
      life,
      alpha: 1,
    })
  }

  return particles
}

/**
 * 更新粒子状态：移动 + 衰减 + 移除死亡粒子
 */
export function updateParticles(particles: Particle[]): Particle[] {
  const survived: Particle[] = []

  for (const p of particles) {
    const newLife = p.life - 1
    if (newLife <= 0) continue

    survived.push({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      life: newLife,
      alpha: newLife / Math.max(PARTICLE_LIFE_MAX, p.life + 1),
    })
  }

  return survived
}

// ---- 初始 segments ----

/**
 * 创建初始尾巴段数组（全部堆叠在锚点，后续帧物理模拟展开）
 */
export function createInitialSegments(): TailSegment[] {
  const length = TAIL_DEFAULT_LENGTH / TAIL_SEGMENT_COUNT
  return Array.from({ length: TAIL_SEGMENT_COUNT }, () => ({
    x: 0,
    y: 0,
    angle: Math.PI / 2,
    length,
    color: '',
  }))
}
