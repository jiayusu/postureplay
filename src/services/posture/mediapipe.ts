/**
 * MediaPipe PoseLandmarker 封装
 *
 * 负责加载 WASM 运行时、初始化 PoseLandmarker、执行姿态检测。
 * 使用 CDN 加载 WASM 和模型文件（无需本地文件依赖）。
 */

import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerOptions,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type { Keypoint } from '@/types'

// ---- 常量 ----

/** jsdelivr CDN 上的 WASM 文件路径 */
const WASM_BASE_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'

/** Google Storage 上的 lite 模型路径 */
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

// ---- 模块级状态 ----

let landmarker: PoseLandmarker | null = null
let initialized = false

// ---- 初始化 ----

/**
 * 初始化 PoseLandmarker
 *
 * 先通过 FilesetResolver 加载 WASM 运行时，再创建 PoseLandmarker 实例。
 * 重复调用时会跳过初始化（幂等）。
 *
 * @param onProgress - 可选的进度回调 (0-100)
 */
export async function initializePoseDetector(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (initialized && landmarker) return

  try {
    // 1. 加载 WASM 文件集
    onProgress?.(10)
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH)
    onProgress?.(30)

    // 2. 创建 PoseLandmarker
    const options: PoseLandmarkerOptions = {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }

    onProgress?.(50)
    landmarker = await PoseLandmarker.createFromOptions(vision, options)
    onProgress?.(80)

    initialized = true
    onProgress?.(100)
  } catch (error) {
    initialized = false
    landmarker = null
    throw error
  }
}

// ---- 姿态检测 ----

/**
 * 对一帧视频进行姿态检测
 *
 * @param video - 正在播放的 HTMLVideoElement
 * @param timestamp - 当前帧时间戳（毫秒）
 * @returns 33 个关键点数组，无检测结果时返回空数组
 */
export function detectPose(
  video: HTMLVideoElement,
  timestamp: number,
): Keypoint[] {
  if (!landmarker) {
    console.warn('[PostureService] detectPose called before initialization')
    return []
  }

  let result: PoseLandmarkerResult

  try {
    result = landmarker.detectForVideo(video, timestamp)
  } catch (error) {
    console.error('[PostureService] detectPose error:', error)
    return []
  }

  if (!result.landmarks || result.landmarks.length === 0) {
    return []
  }

  // 取第一组姿势的关键点（numPoses=1）
  const landmarks = result.landmarks[0]

  // 如果检测到的关键点数量不足 33，返回空
  if (landmarks.length < 33) {
    return []
  }

  // 映射为 Keypoint 数组
  return landmarks.map((lm, i) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
    visibility: lm.visibility,
    name: undefined, // 后续可通过 KEYPOINT_NAMES[i] 注入
  }))
}

// ---- 状态查询 ----

/** 获取当前 landmarker 实例（用于检查初始化状态） */
export function getLandmarker(): PoseLandmarker | null {
  return landmarker
}

/** 是否已完成初始化 */
export function isInitialized(): boolean {
  return initialized && landmarker !== null
}

// ---- 资源清理 ----

/** 释放 MediaPipe 资源 */
export function disposePoseDetector(): void {
  if (landmarker) {
    landmarker.close()
    landmarker = null
  }
  initialized = false
}
