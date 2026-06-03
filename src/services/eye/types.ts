/**
 * EyeStateService 接口定义
 */

import type { FaceKeypoint, EyeStateMetrics } from '@/types/eye'

export interface EyeStateServiceInterface {
  /** 初始化 MediaPipe Face Landmarker */
  initialize(onProgress?: (pct: number) => void): Promise<void>

  /** 对一帧视频进行面部检测，返回 478 个面部关键点 */
  detectFace(video: HTMLVideoElement, timestamp: number): Promise<FaceKeypoint[]>

  /** 计算人眼状态指标（EAR、眨眼、注视、疲劳） */
  computeEyeMetrics(faceLandmarks: FaceKeypoint[]): EyeStateMetrics

  /** 检查是否已初始化 */
  isInitialized(): boolean

  /** 释放资源 */
  dispose(): void
}
