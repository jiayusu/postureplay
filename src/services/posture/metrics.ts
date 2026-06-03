/**
 * 体态指标计算 — 纯函数集合
 *
 * 所有函数接收 Keypoint[] 输入，不依赖外部状态。
 * 返回值使用角度（度）或归一化差值，可直接与 NeutralThreshold 比较。
 */

import type { Keypoint, PostureMetrics } from '@/types'
import { BODY_JOINTS } from '@/constants/keypoints'

// ---- 常量 ----

/** 静止判定位移阈值（归一化坐标） */
const STILLNESS_MOVEMENT_EPSILON = 0.01

/** 呼吸模式判定中 belly vs chest 的倍数阈值 */
const BREATH_BELLY_RATIO = 1.5

/** 情绪推断规则用到的秒数阈值 */
const STILLNESS_TENSE_SEC = 180
const STILLNESS_FATIGUED_SEC = 300

/** 可见性最低阈值（低于此值认为该关键点不可靠） */
const VISIBILITY_MIN = 0.5

// ---- 工具函数 ----

/** 获取关键点，visibility 过低或不存在则返回 null */
function safePoint(keypoints: Keypoint[], index: number): Keypoint | null {
  const kp = keypoints[index]
  if (!kp || kp.visibility < VISIBILITY_MIN) return null
  return kp
}

/** 计算两点中点 */
function midpoint(a: Keypoint, b: Keypoint): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** 计算连线与垂直线的夹角（度） */
function verticalAngle(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const dx = to.x - from.x
  const dy = to.y - from.y // 图像坐标系 y 轴向下
  // 垂直向上方向为 (0, -1)
  // 角度 = atan2(水平偏移, 垂直分量)
  const rad = Math.atan2(Math.abs(dx), -dy)
  return (rad * 180) / Math.PI
}

/** 计算两帧关键点的平均欧氏位移 */
function averageDisplacement(
  current: Keypoint[],
  previous: Keypoint[],
): number {
  const count = Math.min(current.length, previous.length)
  if (count === 0) return 0

  let total = 0
  for (let i = 0; i < count; i++) {
    const dx = current[i].x - previous[i].x
    const dy = current[i].y - previous[i].y
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return total / count
}

// ---- 步骤 23：脊柱、肩膀、头部 ----

/**
 * 计算脊柱垂直偏差角
 *
 * 取鼻尖 (0) 到髋中心 (23+24 中点) 的连线与垂直线的夹角。
 * 返回度数，0 = 完全垂直。
 */
export function computeSpineAngle(keypoints: Keypoint[]): number {
  const nose = safePoint(keypoints, BODY_JOINTS.nose)
  const leftHip = safePoint(keypoints, BODY_JOINTS.hips.left)
  const rightHip = safePoint(keypoints, BODY_JOINTS.hips.right)

  if (!nose || !leftHip || !rightHip) return 0

  const hipCenter = midpoint(leftHip, rightHip)
  return verticalAngle(hipCenter, nose)
}

/**
 * 计算肩膀高度差
 *
 * 取左肩 (11) 和右肩 (12) 的 y 坐标差的绝对值。
 * 返回归一化坐标差值，0 = 完全水平。
 */
export function computeShoulderDiff(keypoints: Keypoint[]): number {
  const leftShoulder = safePoint(keypoints, BODY_JOINTS.shoulders.left)
  const rightShoulder = safePoint(keypoints, BODY_JOINTS.shoulders.right)

  if (!leftShoulder || !rightShoulder) return 0

  return Math.abs(leftShoulder.y - rightShoulder.y)
}

/**
 * 计算头部前倾角
 *
 * 取耳朵中点 (7+8) 到肩膀中点 (11+12) 的连线与垂直线的夹角。
 * 返回度数，0 = 头部完全正直。
 */
export function computeHeadForwardAngle(keypoints: Keypoint[]): number {
  const leftEar = safePoint(keypoints, BODY_JOINTS.ears.left)
  const rightEar = safePoint(keypoints, BODY_JOINTS.ears.right)
  const leftShoulder = safePoint(keypoints, BODY_JOINTS.shoulders.left)
  const rightShoulder = safePoint(keypoints, BODY_JOINTS.shoulders.right)

  if (!leftEar || !rightEar || !leftShoulder || !rightShoulder) return 0

  const earCenter = midpoint(leftEar, rightEar)
  const shoulderCenter = midpoint(leftShoulder, rightShoulder)

  return verticalAngle(shoulderCenter, earCenter)
}

// ---- 步骤 24：静止、呼吸、情绪 ----

/**
 * 计算当前帧与上一帧之间的静止状态
 *
 * @returns isStill（是否静止）和 delta（平均位移量）
 */
export function computeStillness(
  keypoints: Keypoint[],
  previousKeypoints: Keypoint[] | null,
): { isStill: boolean; delta: number } {
  if (!previousKeypoints) {
    return { isStill: false, delta: 0 }
  }

  const delta = averageDisplacement(keypoints, previousKeypoints)
  return { isStill: delta < STILLNESS_MOVEMENT_EPSILON, delta }
}

/**
 * 推断呼吸模式
 *
 * 比较肩部 (11/12) 和髋部 (23/24) 的 y 轴波动幅度。
 * 髋部波动更大 → belly；肩部波动更大 → chest；接近 → mixed。
 *
 * @returns 'chest' | 'belly' | 'mixed'
 */
export function computeBreathMode(
  keypoints: Keypoint[],
  previousKeypoints: Keypoint[] | null,
): 'chest' | 'belly' | 'mixed' {
  if (!previousKeypoints) return 'mixed'

  // 肩部 y 轴变化
  const shoulderDY = Math.abs(
    (keypoints[BODY_JOINTS.shoulders.left]?.y ?? 0) -
      (previousKeypoints[BODY_JOINTS.shoulders.left]?.y ?? 0) +
      (keypoints[BODY_JOINTS.shoulders.right]?.y ?? 0) -
      (previousKeypoints[BODY_JOINTS.shoulders.right]?.y ?? 0),
  )

  // 髋部 y 轴变化
  const hipDY = Math.abs(
    (keypoints[BODY_JOINTS.hips.left]?.y ?? 0) -
      (previousKeypoints[BODY_JOINTS.hips.left]?.y ?? 0) +
      (keypoints[BODY_JOINTS.hips.right]?.y ?? 0) -
      (previousKeypoints[BODY_JOINTS.hips.right]?.y ?? 0),
  )

  if (hipDY > shoulderDY * BREATH_BELLY_RATIO) return 'belly'
  if (shoulderDY > hipDY * BREATH_BELLY_RATIO) return 'chest'
  return 'mixed'
}

/**
 * 推断情绪状态（基于规则的引擎）
 *
 * 规则：
 * - tense: spineAngle > threshold + breathMode chest + stillness > 180s
 * - relaxed: spineAngle small + breathMode belly + isNeutral
 * - fatigued: stillness > 300s + low confidence
 * - 其他: 'unknown'
 */
export function inferEmotionalState(
  metrics: Partial<PostureMetrics>,
): PostureMetrics['emotionalState'] {
  const {
    spineAngle = 0,
    breathMode = 'mixed',
    stillnessDuration = 0,
    isNeutral = false,
    confidence = 1,
  } = metrics

  // tense: 脊柱前倾 + 胸式呼吸 + 长时间静止
  // stillnessDuration 是毫秒，阈值需要 ×1000 对齐
  if (
    spineAngle > 10 &&
    breathMode === 'chest' &&
    stillnessDuration > STILLNESS_TENSE_SEC * 1000
  ) {
    return 'tense'
  }

  // relaxed: 脊柱正直 + 腹式呼吸 + 中立位
  if (
    spineAngle < 8 &&
    breathMode === 'belly' &&
    isNeutral
  ) {
    return 'relaxed'
  }

  // fatigued: 长时间静止 + 低置信度
  if (
    stillnessDuration > STILLNESS_FATIGUED_SEC * 1000 &&
    confidence < 0.7
  ) {
    return 'fatigued'
  }

  return 'unknown'
}
