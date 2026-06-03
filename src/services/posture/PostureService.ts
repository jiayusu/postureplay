/**
 * PostureService — 姿态引擎核心服务
 *
 * 封装 MediaPipe PoseLandmarker 初始化和体态指标计算管道。
 * 高精度（亚像素级）运动检测：静止时长精确到 ms，呼吸模式基于单帧位移差。
 */

import type { Keypoint, PostureMetrics, NeutralThreshold } from '@/types'
import type { PostureServiceInterface } from './types'
import { initializePoseDetector, detectPose, disposePoseDetector } from './mediapipe'
import {
  computeSpineAngle,
  computeShoulderDiff,
  computeHeadForwardAngle,
  computeStillness,
  computeBreathMode,
  inferEmotionalState,
} from './metrics'
import { TAILBONE_ANCHOR_INDICES } from '@/constants/keypoints'
import { DEFAULT_NEUTRAL_THRESHOLD } from '@/constants/config'

export class PostureService implements PostureServiceInterface {
  /** 静止开始时间戳（ms），用于累加 stillnessDuration */
  private stillnessStartMs: number | null = null
  private initialized = false

  /** 初始化 MediaPipe PoseLandmarker，含进度回调 */
  async initialize(onProgress?: (pct: number) => void): Promise<void> {
    await initializePoseDetector(onProgress)
    this.initialized = true
  }

  /** 对一帧视频进行姿态检测 */
  async detect(
    video: HTMLVideoElement,
    timestamp: number,
  ): Promise<Keypoint[]> {
    return detectPose(video, timestamp)
  }

  /**
   * 计算体态指标
   *
   * @param keypoints - 当前帧的 33 个关键点
   * @param baseline - 校准基准关键点（null 时各偏差置 0）
   */
  computeMetrics(keypoints: Keypoint[], baseline: Keypoint[] | null): PostureMetrics {
    const now = Date.now()

    // 核心三项指标
    const spineAngle = computeSpineAngle(keypoints)
    const shoulderLevelDiff = computeShoulderDiff(keypoints)
    const headForwardAngle = computeHeadForwardAngle(keypoints)

    // 骨盆倾斜代理：左右髋关节 y 坐标差
    const leftHipY = keypoints[TAILBONE_ANCHOR_INDICES.leftHip]?.y ?? 0
    const rightHipY = keypoints[TAILBONE_ANCHOR_INDICES.rightHip]?.y ?? 0
    const pelvicTiltProxy = Math.abs(leftHipY - rightHipY)

    // 置信度：核心关节点可见性的均值
    const confidenceJoints = [
      keypoints[0],  // nose
      keypoints[11], // left_shoulder
      keypoints[12], // right_shoulder
      keypoints[23], // left_hip
      keypoints[24], // right_hip
      keypoints[7],  // left_ear
      keypoints[8],  // right_ear
    ]
    const confidence =
      confidenceJoints.reduce((sum, kp) => sum + (kp?.visibility ?? 0), 0) /
      confidenceJoints.length

    // 基准偏差（相对于校准基线）
    let spineAngleDeviation = 0
    let shoulderDiffDeviation = 0
    let headAngleDeviation = 0

    if (baseline) {
      const baseSpine = computeSpineAngle(baseline)
      const baseShoulder = computeShoulderDiff(baseline)
      const baseHead = computeHeadForwardAngle(baseline)
      spineAngleDeviation = Math.abs(spineAngle - baseSpine)
      shoulderDiffDeviation = Math.abs(shoulderLevelDiff - baseShoulder)
      headAngleDeviation = Math.abs(headForwardAngle - baseHead)
    }

    const t = DEFAULT_NEUTRAL_THRESHOLD
    const computedNeutral =
      Math.abs(spineAngle) <= t.spineAngleMax &&
      Math.abs(shoulderLevelDiff) <= t.shoulderDiffMax &&
      Math.abs(headForwardAngle) <= t.headAngleMax

    return {
      timestamp: now,
      spineAngle,
      shoulderLevelDiff,
      headForwardAngle,
      pelvicTiltProxy,
      breathMode: 'mixed',
      stillnessDuration: 0,
      emotionalState: 'unknown',
      isNeutral: computedNeutral,
      confidence,
      spineAngleDeviation,
      shoulderDiffDeviation,
      headAngleDeviation,
    }
  }

  /**
   * 更新静止时长和情绪推断
   *
   * 基于两帧之间的位移计算是否静止，累加静止时长。
   * 同时推断呼吸模式和情绪状态。
   *
   * @returns 更新后的 metrics（不修改原对象）
   */
  updateStillnessAndEmotion(
    metrics: PostureMetrics,
    currentKeypoints: Keypoint[],
    previousKeypoints: Keypoint[] | null,
  ): PostureMetrics {
    // 静止检测
    const { isStill, delta } = computeStillness(currentKeypoints, previousKeypoints)

    const now = Date.now()
    let stillnessDuration = metrics.stillnessDuration

    if (isStill) {
      if (this.stillnessStartMs === null) {
        this.stillnessStartMs = now
      } else {
        stillnessDuration = now - this.stillnessStartMs
      }
    } else {
      this.stillnessStartMs = null
      stillnessDuration = 0
    }

    // 呼吸模式
    const breathMode = computeBreathMode(currentKeypoints, previousKeypoints)

    // 情绪推断
    const emotionalState = inferEmotionalState({
      ...metrics,
      breathMode,
      stillnessDuration,
    })

    return {
      ...metrics,
      breathMode,
      stillnessDuration,
      emotionalState,
    }
  }

  /** 判断指标是否在阈值范围内 */
  isNeutral(metrics: PostureMetrics, threshold: NeutralThreshold): boolean {
    return (
      metrics.spineAngle <= threshold.spineAngleMax &&
      metrics.shoulderLevelDiff <= threshold.shoulderDiffMax &&
      metrics.headForwardAngle <= threshold.headAngleMax
    )
  }

  /** 释放 MediaPipe 资源 */
  dispose(): void {
    disposePoseDetector()
    this.initialized = false
    this.stillnessStartMs = null
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this.initialized
  }
}

// ---- 单例 ----

let instance: PostureService | null = null

export function getPostureService(): PostureService {
  if (!instance) {
    instance = new PostureService()
  }
  return instance
}
