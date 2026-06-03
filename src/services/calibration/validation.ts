/**
 * 校准数据验证与统计算法 — 纯函数集合
 *
 * 包含中位数计算、有效帧筛选、最小样本检查、置信度计算。
 */

import type { Keypoint } from '@/types'

/** 关键点 visibility 最低阈值（低于此值认为该关键点不可靠） */
const MIN_VISIBILITY = 0.7

/** 有效关键点最低占比（帧内） */
const MIN_VALID_POINTS_RATIO = 0.5

/** 有效帧最低数量（30s 内至少 10s 有效数据） */
const MIN_VALID_FRAMES = 20

// ---- 中位数 ----

/**
 * 计算数组的中位数
 *
 * 排序后取中间值（偶数个取中间两个的均值）。
 */
export function calcMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }

  return sorted[mid]
}

// ---- 帧验证 ----

/**
 * 判断单帧是否有效
 *
 * 条件：至少 50% 的关键点 visibility >= 0.7
 */
export function isFrameValid(keypoints: Keypoint[]): boolean {
  if (keypoints.length === 0) return false

  const validCount = keypoints.filter(
    (kp) => kp.visibility >= MIN_VISIBILITY,
  ).length

  return validCount / keypoints.length >= MIN_VALID_POINTS_RATIO
}

/**
 * 筛选有效帧
 *
 * 返回所有满足 isFrameValid 的帧。
 */
export function filterValidFrames(
  samples: Keypoint[][],
): Keypoint[][] {
  return samples.filter(isFrameValid)
}

/**
 * 统计有效帧数量
 */
export function validateCalibrationSamples(samples: Keypoint[][]): number {
  return filterValidFrames(samples).length
}

/**
 * 是否达到最低有效帧数（≥20）
 */
export function hasMinValidSamples(samples: Keypoint[][]): boolean {
  return validateCalibrationSamples(samples) >= MIN_VALID_FRAMES
}

/**
 * 计算校准置信度
 *
 * = 有效帧数 / 总帧数
 */
export function computeCalibrationConfidence(samples: Keypoint[][]): number {
  if (samples.length === 0) return 0
  return validateCalibrationSamples(samples) / samples.length
}

// ---- 基线计算 ----

/**
 * 从一组有效帧计算基线关键点（逐点取中位数）
 *
 * 对所有有效帧，按关键点索引分组，
 * 取每个索引的 x/y/z/visibility 中位数。
 *
 * @param validFrames - 已通过 isFrameValid 筛选的帧
 * @returns 33 个中位数关键点
 */
export function computeBaselineKeypoints(
  validFrames: Keypoint[][],
): Keypoint[] {
  if (validFrames.length === 0) return []

  // 取第一帧的关键点数量作为基准
  const keypointCount = validFrames[0].length
  const baseline: Keypoint[] = []

  for (let i = 0; i < keypointCount; i++) {
    const xValues: number[] = []
    const yValues: number[] = []
    const zValues: number[] = []
    const vValues: number[] = []

    for (const frame of validFrames) {
      if (frame[i]) {
        xValues.push(frame[i].x)
        yValues.push(frame[i].y)
        zValues.push(frame[i].z)
        vValues.push(frame[i].visibility)
      }
    }

    baseline.push({
      x: calcMedian(xValues),
      y: calcMedian(yValues),
      z: calcMedian(zValues),
      visibility: calcMedian(vValues),
    })
  }

  return baseline
}
