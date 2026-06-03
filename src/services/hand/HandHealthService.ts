/**
 * HandHealthService — 手部健康核心服务
 *
 * 封装 MediaPipe Hand Landmarker 初始化和手部健康指标计算管道。
 * 实现手指长度、颜色、震颤、关节灵活性、掌纹线的综合分析。
 */

import type { HandKeypoint, HandHealthMetrics, CombinedHandMetrics } from '@/types/hand'
import type { HandHealthServiceInterface } from './types'
import type { DetectedHand } from './mediapipeHand'
import {
  initializeHandDetector,
  detectHands,
  disposeHandDetector,
} from './mediapipeHand'
import {
  computeAllFingerMetrics,
  computeDigitRatio,
  computePalmColor,
  computeTremor,
  resetTremorState,
  computeJointFlexibilityScore,
  detectPalmLines,
  computeOverallHealthScore,
  computeSymmetryScore,
} from './palmAnalysis'

export class HandHealthService implements HandHealthServiceInterface {
  private initialized = false

  // ---- 初始化 ----

  async initialize(onProgress?: (pct: number) => void): Promise<void> {
    await initializeHandDetector(onProgress)
    this.initialized = true
  }

  // ---- 检测 ----

  detectHands(video: HTMLVideoElement, timestamp: number): DetectedHand[] {
    return detectHands(video, timestamp)
  }

  // ---- 单手健康指标计算 ----

  computeHandMetrics(hand: DetectedHand, canvas: HTMLCanvasElement | null): HandHealthMetrics {
    const now = Date.now()
    const landmarks = hand.landmarks

    // 1. 计算手指指标
    const fingers = computeAllFingerMetrics(landmarks)

    // 2. 计算 2D:4D 比值
    const digitRatio = computeDigitRatio(fingers)

    // 3. 计算手掌颜色（需要 Canvas）
    const palmColor = canvas
      ? computePalmColor(landmarks, canvas)
      : createDefaultPalmColor()

    // 4. 计算震颤
    const tremor = computeTremor(landmarks, now)

    // 5. 关节灵活性
    const jointFlex = computeJointFlexibilityScore(fingers)

    // 6. 掌纹线检测（需要 Canvas）
    const palmLines = canvas
      ? detectPalmLines(landmarks, canvas)
      : createDefaultPalmLines()

    // 7. 甲床颜色（使用指尖区域，简化用食指指尖附近采样）
    const nailBedColor = canvas
      ? computeNailBedColor(landmarks, canvas)
      : null

    // 8. 综合健康评分
    const health = computeOverallHealthScore({
      digitRatio,
      palmColor,
      tremor,
      jointFlex,
      palmLines,
    })

    return {
      timestamp: now,
      handedness: hand.handedness,
      confidence: hand.confidence,
      fingers,
      digitRatio,
      palmColor,
      tremor,
      palmLines,
      nailBedColor,
      healthScore: health.score,
      healthSummary: health.summary,
      recommendations: health.recommendations,
    }
  }

  // ---- 双手综合指标 ----

  computeCombinedMetrics(
    leftHand: HandHealthMetrics | null,
    rightHand: HandHealthMetrics | null,
  ): CombinedHandMetrics {
    const symmetryScore = computeSymmetryScore(leftHand, rightHand)

    // 综合评分
    let overallScore = 70
    let summary = '无法获取完整的手部数据'
    const combinedRecs: string[] = []

    if (leftHand && rightHand) {
      overallScore = Math.round((leftHand.healthScore + rightHand.healthScore) / 2)
      summary = `双手综合健康评分 ${overallScore}/100`

      if (symmetryScore < 0.6) {
        combinedRecs.push('双手对称性偏低，注意双侧均衡使用，避免单侧过劳')
      }

      // 合并建议（去重）
      const allRecs = new Set([
        ...leftHand.recommendations,
        ...rightHand.recommendations,
        ...combinedRecs,
      ])
      combinedRecs.length = 0
      combinedRecs.push(...allRecs)

      if (overallScore >= 85) {
        summary = '双手健康表现良好！各项指标正常，继续保持。'
      } else if (overallScore >= 70) {
        summary = '双手健康整体正常，有轻微改善空间。'
      }
    } else if (leftHand) {
      overallScore = leftHand.healthScore
      summary = `仅检测到左手，健康评分 ${overallScore}/100`
      combinedRecs.push(...leftHand.recommendations)
      combinedRecs.push('请将右手也放入摄像头视野以获得完整评估')
    } else if (rightHand) {
      overallScore = rightHand.healthScore
      summary = `仅检测到右手，健康评分 ${overallScore}/100`
      combinedRecs.push(...rightHand.recommendations)
      combinedRecs.push('请将左手也放入摄像头视野以获得完整评估')
    }

    return {
      timestamp: Date.now(),
      leftHand,
      rightHand,
      symmetryScore,
      overallHealthScore: overallScore,
      overallSummary: summary,
      combinedRecommendations: combinedRecs,
    }
  }

  // ---- 状态查询 ----

  isInitialized(): boolean {
    return this.initialized
  }

  // ---- 资源清理 ----

  dispose(): void {
    disposeHandDetector()
    resetTremorState()
    this.initialized = false
  }
}

// ---- 单例 ----

let instance: HandHealthService | null = null

export function getHandHealthService(): HandHealthService {
  if (!instance) {
    instance = new HandHealthService()
  }
  return instance
}

// ---- 工厂函数 ----

function createDefaultPalmColor() {
  return {
    meanRed: 0.5,
    meanGreen: 0.5,
    meanBlue: 0.5,
    redness: 0.2,
    colorCategory: 'normal' as const,
    confidence: 0,
  }
}

function createDefaultPalmLines() {
  return [
    { name: 'life_line' as const, startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, length: 0, clarity: 0.3, continuity: 0.2, depth: 0.2, detected: false },
    { name: 'heart_line' as const, startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, length: 0, clarity: 0.3, continuity: 0.2, depth: 0.2, detected: false },
    { name: 'head_line' as const, startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, length: 0, clarity: 0.3, continuity: 0.2, depth: 0.2, detected: false },
    { name: 'fate_line' as const, startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, length: 0, clarity: 0.3, continuity: 0.2, depth: 0.2, detected: false },
  ]
}

/** 简易甲床颜色分析（使用食指尖部区域） */
function computeNailBedColor(
  landmarks: HandKeypoint[],
  canvas: HTMLCanvasElement,
) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  // 使用食指指尖附近区域
  const indexTip = landmarks[8] // index_finger_tip
  if (indexTip.visibility < 0.5) return null

  const size = 10
  const sx = Math.round(Math.max(0, indexTip.x * canvas.width - size / 2))
  const sy = Math.round(Math.max(0, indexTip.y * canvas.height - size / 2))
  const sw = Math.min(size, canvas.width - sx)
  const sh = Math.min(size, canvas.height - sy)

  if (sw <= 0 || sh <= 0) return null

  try {
    const imageData = ctx.getImageData(sx, sy, sw, sh)
    const pixels = imageData.data
    let totalR = 0, totalG = 0, totalB = 0
    const count = pixels.length / 4

    for (let i = 0; i < pixels.length; i += 4) {
      totalR += pixels[i]
      totalG += pixels[i + 1]
      totalB += pixels[i + 2]
    }

    const meanR = count > 0 ? totalR / count / 255 : 0.5
    const meanG = count > 0 ? totalG / count / 255 : 0.5
    const meanB = count > 0 ? totalB / count / 255 : 0.5

    let colorCategory: 'normal' | 'pale' | 'cyanotic' = 'normal'
    if (meanR < 0.35) colorCategory = 'pale'
    else if (meanB > meanR * 1.2) colorCategory = 'cyanotic'

    return {
      meanRed: meanR,
      meanGreen: meanG,
      meanBlue: meanB,
      redness: clamp2(meanR - meanG + 0.2, 0, 1),
      colorCategory,
      confidence: 0.5,
    }
  } catch {
    return null
  }
}

function clamp2(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
