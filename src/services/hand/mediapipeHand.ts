/**
 * MediaPipe Hand Landmarker 封装
 *
 * 负责初始化 HandLandmarker、执行手部关键点检测。
 * 与 Pose Landmarker / Face Landmarker 共享同一 @mediapipe/tasks-vision 库。
 */

import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerOptions,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type { HandKeypoint } from '@/types/hand'
import {
  HAND_WASM_BASE_PATH,
  HAND_MODEL_PATH,
  MAX_NUM_HANDS,
} from '@/constants/palmHealthConfig'

// ---- 模块级状态 ----

let handLandmarker: HandLandmarker | null = null
let handInitialized = false

// ---- 初始化 ----

/**
 * 初始化 Hand Landmarker
 *
 * 复用 @mediapipe/tasks-vision 的 WASM 运行时（FilesetResolver 内部会缓存）。
 * 重复调用时幂等。
 */
export async function initializeHandDetector(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (handInitialized && handLandmarker) return

  try {
    onProgress?.(10)
    const vision = await FilesetResolver.forVisionTasks(HAND_WASM_BASE_PATH)
    onProgress?.(30)

    const options: HandLandmarkerOptions = {
      baseOptions: {
        modelAssetPath: HAND_MODEL_PATH,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: MAX_NUM_HANDS,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }

    onProgress?.(50)
    handLandmarker = await HandLandmarker.createFromOptions(vision, options)
    onProgress?.(80)

    handInitialized = true
    onProgress?.(100)
  } catch (error) {
    handInitialized = false
    handLandmarker = null
    throw error
  }
}

// ---- 手部检测 ----

/**
 * 对一帧视频进行手部关键点检测
 *
 * @param video - HTMLVideoElement
 * @param timestamp - 当前帧时间戳（毫秒）
 * @returns 检测到的手部列表，每只手包含 21 个关键点 + 手性
 */
export interface DetectedHand {
  landmarks: HandKeypoint[]
  handedness: 'Left' | 'Right'
  confidence: number
}

export function detectHands(
  video: HTMLVideoElement,
  timestamp: number,
): DetectedHand[] {
  if (!handLandmarker) {
    console.warn('[HandHealthService] detectHands called before initialization')
    return []
  }

  // 视频帧未就绪时跳过检测（避免 MediaPipe ROI 为 0 的内部错误）
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return []
  }

  let result: HandLandmarkerResult

  try {
    result = handLandmarker.detectForVideo(video, timestamp)
  } catch (_error) {
    // MediaPipe 在画面中没有手时内部会抛 ROI 错误，属于正常情况，
    // 降级为 debug 级别避免控制台刷屏
    return []
  }

  if (!result.landmarks || result.landmarks.length === 0) {
    return []
  }

  const hands: DetectedHand[] = []

  for (let i = 0; i < result.landmarks.length; i++) {
    const landmarks = result.landmarks[i]
    if (landmarks.length < 21) continue

    const handedness = result.handedness?.[i]?.[0]
    const handLabel = handedness?.displayName === 'Left'
      ? 'Left' as const
      : 'Right' as const
    const handConf = handedness?.score ?? 0.5

    hands.push({
      landmarks: landmarks.map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility ?? 1.0,
      })),
      handedness: handLabel,
      confidence: handConf,
    })
  }

  return hands
}

// ---- 状态查询 ----

export function getHandLandmarker(): HandLandmarker | null {
  return handLandmarker
}

export function isHandInitialized(): boolean {
  return handInitialized && handLandmarker !== null
}

// ---- 资源清理 ----

export function disposeHandDetector(): void {
  if (handLandmarker) {
    handLandmarker.close()
    handLandmarker = null
  }
  handInitialized = false
}
