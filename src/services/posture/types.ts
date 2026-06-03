/**
 * PostureService 模块类型定义
 *
 * 从全局类型重新导出关键类型，定义服务接口。
 */

import type { Keypoint, PostureMetrics, NeutralThreshold } from '@/types'

export type { Keypoint, PostureMetrics, NeutralThreshold }

/** PostureService 对外接口 */
export interface PostureServiceInterface {
  /** 初始化 MediaPipe PoseLandmarker */
  initialize(onProgress?: (pct: number) => void): Promise<void>

  /** 对一帧视频进行姿态检测，返回 33 个关键点 */
  detect(video: HTMLVideoElement, timestamp: number): Promise<Keypoint[]>

  /** 根据当前关键点和 baseline 计算体态指标 */
  computeMetrics(keypoints: Keypoint[], baseline: Keypoint[] | null): PostureMetrics

  /** 更新静止时长和情绪推断 */
  updateStillnessAndEmotion(
    metrics: PostureMetrics,
    currentKeypoints: Keypoint[],
    previousKeypoints: Keypoint[] | null,
  ): PostureMetrics

  /** 判断指标是否在阈值范围内 */
  isNeutral(metrics: PostureMetrics, threshold: NeutralThreshold): boolean

  /** 释放 MediaPipe 资源 */
  dispose(): void

  /** 是否已初始化 */
  isInitialized(): boolean
}
