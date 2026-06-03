/**
 * EyeStateService — 人眼状态核心服务
 *
 * 封装 MediaPipe Face Landmarker 初始化和眼部指标计算管道。
 * 使用有状态类管理闭眼/眨眼跟踪、注视固定和疲劳评分。
 */

import type { FaceKeypoint, EyeStateMetrics, EyeEAR, GazeDirection, FatigueFactors } from '@/types/eye'
import type { EyeStateServiceInterface } from './types'
import { initializeFaceDetector, detectFace, disposeFaceDetector } from './mediapipeFace'
import {
  computeLeftEAR,
  computeRightEAR,
  updateBlinkState,
  type BlinkState,
  computeGazeDirection,
  computeScreenDistance,
  computeFatigueScore,
  lowBlinkRateSeverity,
  eyelidDroopSeverity,
} from './eyeMetrics'
import { GAZE_FIXATION_FRAMES, SCREEN_TOO_CLOSE_THRESHOLD } from '@/constants/eyeConfig'

export class EyeStateService implements EyeStateServiceInterface {
  private initialized = false

  // 眨眼状态跟踪（左右眼各自独立）
  private leftBlinkState: BlinkState | null = null
  private rightBlinkState: BlinkState | null = null

  // 眨眼计数与时间戳（用于计算眨眼频率）
  private blinkTimestamps: number[] = []

  // 注视固定跟踪
  private lastGazeDirection: GazeDirection | null = null
  private gazeFixationFrames = 0

  // EAR 滚动平均值（用于眼睑下垂判断）
  private earHistory: number[] = []
  private readonly earHistoryMaxLen = 30

  // 面部宽度滚动平均（用于屏幕距离平滑）
  private faceWidthHistory: number[] = []
  private readonly faceWidthHistoryMaxLen = 15

  // ---- 初始化 ----

  async initialize(onProgress?: (pct: number) => void): Promise<void> {
    await initializeFaceDetector(onProgress)
    this.initialized = true
  }

  // ---- 检测 ----

  async detectFace(video: HTMLVideoElement, timestamp: number): Promise<FaceKeypoint[]> {
    return detectFace(video, timestamp)
  }

  // ---- 指标计算 ----

  computeEyeMetrics(faceLandmarks: FaceKeypoint[]): EyeStateMetrics {
    const now = Date.now()

    // 1. 计算左右眼 EAR
    const leftEAR = computeLeftEAR(faceLandmarks)
    const rightEAR = computeRightEAR(faceLandmarks)

    // 2. 更新眨眼状态
    this.leftBlinkState = updateBlinkState(leftEAR, this.leftBlinkState)
    this.rightBlinkState = updateBlinkState(rightEAR, this.rightBlinkState)

    // 3. 眨眼完成时记录时间戳
    if (this.leftBlinkState.blinkJustCompleted || this.rightBlinkState.blinkJustCompleted) {
      this.blinkTimestamps.push(now)
      // 清理过期时间戳
      const cutoff = now - 60_000 // 60 秒窗口
      this.blinkTimestamps = this.blinkTimestamps.filter((t) => t >= cutoff)
    }

    // 4. 计算综合眨眼频率
    const blinkRate = this.blinkTimestamps.length // 过去 60 秒内眨眼次数 = 次/分钟

    // 5. 计算注视方向
    const gaze = computeGazeDirection(faceLandmarks)

    // 注视固定检测
    if (this.lastGazeDirection) {
      const gazeChanged =
        Math.abs(gaze.horizontal - this.lastGazeDirection.horizontal) > 0.05 ||
        Math.abs(gaze.vertical - this.lastGazeDirection.vertical) > 0.05
      if (gazeChanged) {
        this.gazeFixationFrames = 0
      } else if (gaze.isLookingAtScreen) {
        this.gazeFixationFrames++
      }
    }
    this.lastGazeDirection = gaze

    // 6. EAR 滚动平均
    const avgEAR = (leftEAR + rightEAR) / 2
    this.earHistory.push(avgEAR)
    if (this.earHistory.length > this.earHistoryMaxLen) this.earHistory.shift()

    const smoothEAR = this.earHistory.reduce((s, v) => s + v, 0) / this.earHistory.length

    // 7. 屏幕距离估计
    const rawDistance = computeScreenDistance(faceLandmarks)
    this.faceWidthHistory.push(rawDistance)
    if (this.faceWidthHistory.length > this.faceWidthHistoryMaxLen) this.faceWidthHistory.shift()
    const smoothDistance = this.faceWidthHistory.reduce((s, v) => s + v, 0) / this.faceWidthHistory.length

    // 8. 疲劳因素
    const factors: FatigueFactors = {
      lowBlinkRate: lowBlinkRateSeverity(blinkRate),
      eyelidDroop: eyelidDroopSeverity(smoothEAR),
      gazeFixation: clamp(this.gazeFixationFrames / GAZE_FIXATION_FRAMES, 0, 1),
      tooClose: smoothDistance < SCREEN_TOO_CLOSE_THRESHOLD
        ? clamp(1 - smoothDistance / SCREEN_TOO_CLOSE_THRESHOLD, 0, 1)
        : 0,
    }

    const fatigueScore = computeFatigueScore(factors)

    // 9. 构建左右眼 EAR 对象
    const leftEye: EyeEAR = {
      ear: leftEAR,
      blinkCount: this.blinkTimestamps.length,
      isBlinking: this.leftBlinkState.isBlinking,
      blinkDuration: this.leftBlinkState.blinkDuration,
    }
    const rightEye: EyeEAR = {
      ear: rightEAR,
      blinkCount: this.blinkTimestamps.length,
      isBlinking: this.rightBlinkState.isBlinking,
      blinkDuration: this.rightBlinkState.blinkDuration,
    }

    // 10. 置信度
    const confidence = faceLandmarks.length >= 468 ? 0.95 : 0.5

    return {
      timestamp: now,
      leftEye,
      rightEye,
      blinkRate,
      gaze,
      fatigueScore,
      estimatedScreenDistance: smoothDistance,
      confidence,
      faceLandmarkCount: faceLandmarks.length,
    }
  }

  // ---- 状态查询 ----

  isInitialized(): boolean {
    return this.initialized
  }

  // ---- 资源清理 ----

  dispose(): void {
    disposeFaceDetector()
    this.initialized = false
    this.leftBlinkState = null
    this.rightBlinkState = null
    this.blinkTimestamps = []
    this.lastGazeDirection = null
    this.gazeFixationFrames = 0
    this.earHistory = []
    this.faceWidthHistory = []
  }
}

// ---- 单例 ----

let instance: EyeStateService | null = null

export function getEyeStateService(): EyeStateService {
  if (!instance) {
    instance = new EyeStateService()
  }
  return instance
}

// ---- 工具 ----

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
