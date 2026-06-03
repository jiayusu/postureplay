/**
 * HandHealthService 接口定义
 */

import type { DetectedHand } from './mediapipeHand'
import type { HandHealthMetrics, CombinedHandMetrics } from '@/types/hand'

export interface HandHealthServiceInterface {
  /** 初始化 MediaPipe Hand Landmarker */
  initialize(onProgress?: (pct: number) => void): Promise<void>

  /** 对一帧视频进行手部检测，返回检测到的手部列表 */
  detectHands(video: HTMLVideoElement, timestamp: number): DetectedHand[]

  /** 计算单手健康指标 */
  computeHandMetrics(hand: DetectedHand, canvas: HTMLCanvasElement | null): HandHealthMetrics

  /** 计算双手综合指标 */
  computeCombinedMetrics(
    leftHand: HandHealthMetrics | null,
    rightHand: HandHealthMetrics | null,
  ): CombinedHandMetrics

  /** 检查是否已初始化 */
  isInitialized(): boolean

  /** 释放资源 */
  dispose(): void
}
